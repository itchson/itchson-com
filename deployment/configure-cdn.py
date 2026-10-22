#!/usr/bin/env python3
"""One-time CloudFront configuration; review and run only after the new site is live.

python3 deployment/configure-cdn.py --root . --backup-dir /absolute/new/path --apply
Use --prepare-only instead to create detached policies and the exact route function.
No AWS credentials, object data, bucket permissions, or origin settings are changed.
"""
import argparse
import copy
import json
import os
from pathlib import Path
import subprocess
import sys

ACCOUNT = "513346603319"
DISTRIBUTION = "E20TZP2HDNPJLG"
ORIGIN = "itchson.com.s3.ap-southeast-2.amazonaws.com"
OAC = "E4RMTD656UGGI"
MANAGED_CACHE = "658327ea-f89d-4fab-a63d-7e88639e58f6"
FUNCTION_NAME = "itchson-legacy-routes"
FUNCTION_ARN = f"arn:aws:cloudfront::{ACCOUNT}:function/{FUNCTION_NAME}"
FUNCTION_CONFIG = {
    "Comment": "Preserve the legacy itchson.com landing-page routes.",
    "Runtime": "cloudfront-js-2.0",
}
CACHE_CONFIG = {
    "Name": "itchson-origin-cache-control",
    "Comment": "Static itchson.com assets; honor origin Cache-Control, including revalidation.",
    "MinTTL": 0,
    "DefaultTTL": 3600,
    "MaxTTL": 31536000,
    "ParametersInCacheKeyAndForwardedToOrigin": {
        "EnableAcceptEncodingGzip": True,
        "EnableAcceptEncodingBrotli": True,
        "HeadersConfig": {"HeaderBehavior": "none"},
        "CookiesConfig": {"CookieBehavior": "none"},
        "QueryStringsConfig": {"QueryStringBehavior": "none"},
    },
}


def aws(*args):
    env = dict(os.environ, AWS_PAGER="", AWS_CLI_AUTO_PROMPT="off")
    result = subprocess.run(
        ["aws", *args, "--region", "ap-southeast-2", "--output", "json", "--no-cli-pager", "--no-cli-auto-prompt"],
        text=True, capture_output=True, env=env, check=False,
    )
    if result.returncode:
        # Avoid dumping AWS responses or credential diagnostics into terminal logs.
        raise RuntimeError(f"AWS {' '.join(args[:2])} failed (exit {result.returncode}).")
    return json.loads(result.stdout) if result.stdout.strip() else {}


def save(directory, name, value):
    destination = directory / name
    destination.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")
    destination.chmod(0o600)
    return destination


def file_arg(file, binary=False):
    return ("fileb://" if binary else "file://") + str(file.resolve())


def list_items(operation, collection, *args):
    """CloudFront list operations use API markers, rather than S3 pagination."""
    items = []
    marker = None
    seen = set()
    while True:
        extra = ("--marker", marker) if marker else ()
        page = aws("cloudfront", operation, *args, *extra)[collection]
        items.extend(page.get("Items", []))
        marker = page.get("NextMarker")
        if not marker:
            return items
        if marker in seen:
            raise RuntimeError(f"Repeated pagination marker for {operation}.")
        seen.add(marker)


def existing_policy(kind, config):
    plural, singular = {
        "cache": ("CachePolicyList", "CachePolicy"),
        "response-headers": ("ResponseHeadersPolicyList", "ResponseHeadersPolicy"),
    }[kind]
    key = singular + "Config"
    matches = [entry[singular] for entry in list_items(f"list-{kind}-policies", plural, "--type", "custom")
               if entry[singular][key]["Name"] == config["Name"]]
    if len(matches) > 1:
        raise RuntimeError(f"Duplicate policy name {config['Name']}.")
    if not matches:
        return None
    current = aws("cloudfront", f"get-{kind}-policy", "--id", matches[0]["Id"])[singular]
    if current[key] != config:
        raise RuntimeError(f"Existing policy {config['Name']} differs from the reviewed configuration; it will not be modified.")
    return current["Id"]


def create_policy(kind, config, directory):
    singular = "CachePolicy" if kind == "cache" else "ResponseHeadersPolicy"
    source = save(directory, f"expected-{kind}-policy.json", config)
    created = aws("cloudfront", f"create-{kind}-policy", f"--{kind}-policy-config", file_arg(source))
    save(directory, f"created-{kind}-policy.json", created)
    return created[singular]["Id"]


def same_function_config(actual):
    actual = copy.deepcopy(actual)
    # AWS may explicitly return this omitted, empty optional collection.
    if actual.get("KeyValueStoreAssociations") in ({"Quantity": 0}, {"Quantity": 0, "Items": []}):
        actual.pop("KeyValueStoreAssociations")
    return actual == FUNCTION_CONFIG


def inspect_function(stage, expected_code, directory):
    entries = list_items("list-functions", "FunctionList", "--stage", stage)
    matches = [entry for entry in entries if entry["Name"] == FUNCTION_NAME]
    if not matches:
        return None
    if len(matches) != 1:
        raise RuntimeError("Unexpected duplicate route function.")
    described = aws("cloudfront", "describe-function", "--name", FUNCTION_NAME, "--stage", stage)
    summary = described["FunctionSummary"]
    if summary["FunctionMetadata"]["FunctionARN"] != FUNCTION_ARN or not same_function_config(summary["FunctionConfig"]):
        raise RuntimeError(f"Existing {stage} route function configuration differs; refusing to publish it.")
    code_path = directory / f"existing-function-{stage.lower()}.js"
    response = aws("cloudfront", "get-function", "--name", FUNCTION_NAME, "--stage", stage, str(code_path))
    if code_path.read_bytes() != expected_code:
        raise RuntimeError(f"Existing {stage} route function code differs; refusing to overwrite or publish it.")
    save(directory, f"existing-function-{stage.lower()}.json", described)
    return response["ETag"]


def behaviors(config):
    return [config["DefaultCacheBehavior"], *config.get("CacheBehaviors", {}).get("Items", [])]


def validate_distribution(config, cache_id, headers_id):
    if "itchson.com" not in config["Aliases"].get("Items", []):
        raise RuntimeError("The distribution no longer serves itchson.com.")
    origins = {item["Id"]: item for item in config["Origins"]["Items"]}
    for behavior in behaviors(config):
        origin = origins.get(behavior["TargetOriginId"], {})
        if origin.get("DomainName") != ORIGIN or origin.get("OriginAccessControlId") != OAC:
            raise RuntimeError("A cache behavior no longer targets the verified private S3 origin/OAC.")
        if behavior.get("CachePolicyId") not in ({MANAGED_CACHE, cache_id} - {None}):
            raise RuntimeError("An unexpected existing cache policy is attached.")
        if behavior.get("ResponseHeadersPolicyId") not in ({None, "", headers_id}):
            raise RuntimeError("An unexpected response headers policy is attached.")
        if behavior.get("LambdaFunctionAssociations", {}).get("Quantity", 0):
            raise RuntimeError("Unexpected existing Lambda@Edge association; review it manually.")
        associations = behavior.get("FunctionAssociations", {})
        expected = [{"FunctionARN": FUNCTION_ARN, "EventType": "viewer-request"}]
        if associations.get("Quantity", 0) and (associations.get("Quantity") != 1 or associations.get("Items") != expected):
            raise RuntimeError("Unexpected existing CloudFront Function association; review it manually.")
        if "ForwardedValues" in behavior:
            raise RuntimeError("Unexpected legacy forwarding settings; review before applying a cache policy.")


def amended_distribution(config, cache_id, headers_id):
    updated = copy.deepcopy(config)
    for behavior in behaviors(updated):
        behavior["CachePolicyId"] = cache_id
        behavior["ResponseHeadersPolicyId"] = headers_id
        behavior["FunctionAssociations"] = {
            "Quantity": 1,
            "Items": [{"FunctionARN": FUNCTION_ARN, "EventType": "viewer-request"}],
        }
    errors = [item for item in updated.get("CustomErrorResponses", {}).get("Items", []) if item["ErrorCode"] not in (403, 404)]
    errors.extend({"ErrorCode": code, "ResponsePagePath": "/404.html", "ResponseCode": "404", "ErrorCachingMinTTL": 0} for code in (403, 404))
    updated["CustomErrorResponses"] = {"Quantity": len(errors), "Items": sorted(errors, key=lambda item: item["ErrorCode"])}
    return updated


def configure(root, backup_dir, prepare_only=False):
    root = root.resolve(strict=True)
    if not backup_dir.is_absolute():
        raise RuntimeError("--backup-dir must be an absolute, new local directory.")
    backup_dir.mkdir(mode=0o700, parents=True, exist_ok=False)
    headers = json.loads((root / "deployment/response-headers-policy.json").read_text(encoding="utf-8"))["ResponseHeadersPolicyConfig"]
    if headers["Name"] != "itchson-security-headers":
        raise RuntimeError("The reviewed response headers policy name has changed.")
    function_code = (root / "deployment/cloudfront-function.js").read_bytes()
    expected_function_path = backup_dir / "expected-function.js"
    expected_function_path.write_bytes(function_code)
    if aws("sts", "get-caller-identity")["Account"] != ACCOUNT:
        raise RuntimeError("Wrong AWS account; refusing all configuration writes.")
    original = aws("cloudfront", "get-distribution-config", "--id", DISTRIBUTION)
    save(backup_dir, "distribution-original.json", original)

    # Resolve and compare every named resource before any creation or publication.
    cache_id = existing_policy("cache", CACHE_CONFIG)
    headers_id = existing_policy("response-headers", headers)
    validate_distribution(original["DistributionConfig"], cache_id, headers_id)
    development = inspect_function("DEVELOPMENT", function_code, backup_dir)
    live = inspect_function("LIVE", function_code, backup_dir)
    if live and not development:
        raise RuntimeError("The route function has no inspectable development stage.")
    if not cache_id:
        cache_id = create_policy("cache", CACHE_CONFIG, backup_dir)
    if not headers_id:
        headers_id = create_policy("response-headers", headers, backup_dir)
    if not development:
        function_config_path = save(backup_dir, "expected-function-config.json", FUNCTION_CONFIG)
        created = aws("cloudfront", "create-function", "--name", FUNCTION_NAME,
                      "--function-config", file_arg(function_config_path), "--function-code", file_arg(expected_function_path, binary=True))
        save(backup_dir, "created-function.json", created)
        development = created["ETag"]
    if not live:
        published = aws("cloudfront", "publish-function", "--name", FUNCTION_NAME, "--if-match", development)
        save(backup_dir, "published-function.json", published)

    updated = amended_distribution(original["DistributionConfig"], cache_id, headers_id)
    proposed = save(backup_dir, "distribution-proposed.json", updated)
    save(backup_dir, "resource-ids.json", {"distribution": DISTRIBUTION, "cachePolicy": cache_id, "responseHeadersPolicy": headers_id, "function": FUNCTION_ARN})
    if prepare_only:
        print(f"Detached policies and exact route function prepared. Distribution unchanged. Backup: {backup_dir}")
        return
    if updated != original["DistributionConfig"]:
        response = aws("cloudfront", "update-distribution", "--id", DISTRIBUTION, "--if-match", original["ETag"], "--distribution-config", file_arg(proposed))
        save(backup_dir, "distribution-update-response.json", response)
    aws("cloudfront", "wait", "distribution-deployed", "--id", DISTRIBUTION)
    final = aws("cloudfront", "get-distribution-config", "--id", DISTRIBUTION)
    save(backup_dir, "distribution-final.json", final)
    if final["DistributionConfig"] != updated:
        raise RuntimeError("Distribution deployed, but returned configuration differs from the proposed configuration; inspect the saved files.")
    print(f"CloudFront configuration deployed and verified. Original configuration retained in {backup_dir}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path.cwd())
    parser.add_argument("--backup-dir", type=Path, required=True)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--apply", action="store_true")
    mode.add_argument("--prepare-only", action="store_true")
    args = parser.parse_args()
    try:
        configure(args.root, args.backup_dir, args.prepare_only)
    except (OSError, ValueError, KeyError, RuntimeError) as error:
        print(f"Configuration stopped: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
