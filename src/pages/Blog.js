import React from 'react';
import './blog.css';

const blogPosts = [
  {
    title: "My First Blog Post",
    date: "February 26, 2023",
    content: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Mauris maximus elit vel malesuada ullamcorper. Vestibulum vel diam congue, hendrerit ex sit amet, dignissim quam. In finibus lacus ac ex blandit tempus. Donec et tempor magna. Integer bibendum consequat nisl, at posuere tellus hendrerit ut. Aenean iaculis gravida lectus, vel pellentesque turpis aliquet et. Suspendisse potenti."
  },
  {
    title: "My First Blog Post",
    date: "February 26, 2023",
    content: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Mauris maximus elit vel malesuada ullamcorper. Vestibulum vel diam congue, hendrerit ex sit amet, dignissim quam. In finibus lacus ac ex blandit tempus. Donec et tempor magna. Integer bibendum consequat nisl, at posuere tellus hendrerit ut. Aenean iaculis gravida lectus, vel pellentesque turpis aliquet et. Suspendisse potenti."
  },
  {
    title: "My First Blog Post",
    date: "February 26, 2023",
    content: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Mauris maximus elit vel malesuada ullamcorper. Vestibulum vel diam congue, hendrerit ex sit amet, dignissim quam. In finibus lacus ac ex blandit tempus. Donec et tempor magna. Integer bibendum consequat nisl, at posuere tellus hendrerit ut. Aenean iaculis gravida lectus, vel pellentesque turpis aliquet et. Suspendisse potenti."
  },
  // ...
];

function Blog() {
  return (
    <div className="blog-wrapper">
      {blogPosts.map((post, index) => (
        <div className="blog-container" key={index}>
          <h2 className="blog-title">{post.title}</h2>
          <p className="blog-date">{post.date}</p>
          <p className="blog-content">{post.content}</p>
        </div>
      ))}
    </div>
  );
}

export default Blog;
