// Associate with the CloudFront distribution's viewer-request event.
function handler(event) {
  var request = event.request;
  if (request.uri === '/') request.uri = '/index.html';
  if (request.uri === '/blog' || request.uri === '/blog/' || request.uri === '/blog.html') request.uri = '/index.html';
  if (request.uri === '/faq' || request.uri === '/faq/' || request.uri === '/faq.html') request.uri = '/index.html';
  return request;
}
