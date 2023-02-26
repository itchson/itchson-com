import React from 'react';
import styled from 'styled-components';

const HomeWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px;
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
