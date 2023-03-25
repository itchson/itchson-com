import React from 'react';
import styled from 'styled-components';

const HomeWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
  color: #f8e03e;
  text-align: center;
`;

const Home = () => {
  return (
    <HomeWrapper>
      <h1>Welcome to ITCHSON.COM</h1>
      <p>This website is currently under construction. Come back soon...</p>
    </HomeWrapper>
  );
}

export default Home;
