import React from 'react';
import styled from 'styled-components';

const BlogWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  overflow-y: scroll;
`;

const BlogContainer = styled.div`
  background-color: #f8e03e;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0px 0px 10px 0px rgba(0, 0, 0, 0.1);
  margin: 10px;
  width: 90%;
`;

const BlogTitle = styled.h2`
  color: #713491;
  font-size: 36px;
  margin-bottom: 10px;
`;

const BlogDate = styled.p`
  color: #b2b2b2;
  font-size: 16px;
  margin-bottom: 10px;
`;

const BlogContent = styled.p`
  color: #2f2f2f;
  font-size: 20px;
  line-height: 1.5;
`;

const blogPosts = [  {    title: "My First Blog Post",    date: "February 26, 2023",    content: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Mauris maximus elit vel malesuada ullamcorper. Vestibulum vel diam congue, hendrerit ex sit amet, dignissim quam. In finibus lacus ac ex blandit tempus. Donec et tempor magna. Integer bibendum consequat nisl, at posuere tellus hendrerit ut. Aenean iaculis gravida lectus, vel pellentesque turpis aliquet et. Suspendisse potenti."  },
  {    title: "My Second Blog Post",    date: "February 28, 2023",    content: "Duis commodo ultrices sem, vitae lacinia lacus rhoncus vel. Etiam mattis velit et leo tincidunt commodo. Etiam commodo orci sit amet eros volutpat malesuada. Vivamus quis commodo mauris. Sed malesuada tortor eu magna molestie congue. Integer lacinia ipsum vel erat finibus, id dictum nibh pellentesque. Cras vitae elit eget purus dapibus malesuada. Donec vel aliquet sem, non varius dolor."  },  
  {    title: "My Third Blog Post",    date: "March 2, 2023",    content: "Aliquam gravida elit elit, nec imperdiet augue commodo in. Etiam pharetra felis a justo consequat, non scelerisque sapien commodo. Praesent rhoncus risus ac massa porttitor, sed maximus orci rhoncus. Suspendisse rutrum varius lectus quis maximus. Proin vel sodales dolor. Cras eu velit sapien. Nam in enim lorem. Aliquam erat volutpat. Nullam eu arcu lacinia, lacinia purus id, scelerisque turpis."  }];

function Blog() {
  return (
    <BlogWrapper>
      {blogPosts.map((post, index) => (
        <BlogContainer key={index}>
          <BlogTitle>{post.title}</BlogTitle>
          <BlogDate>{post.date}</BlogDate>
          <BlogContent>{post.content}</BlogContent>
        </BlogContainer>
      ))}
    </BlogWrapper>
  );
}

export default Blog;
