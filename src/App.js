import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import styled from 'styled-components';
import Sidebar from './components/Sidebar';
import Home from './pages/Home';
import Blog from './pages/Blog';
import Faq from './pages/Faq';
import './App.css';

const GridContainer = styled.div`
  display: grid;
  overflow: hidden;
  grid-template-areas: 
    "nav article";
  grid-template-rows: 100% 1fr 70px;  
  grid-template-columns: 200px 1fr 0%;
  height: 100vh;
  margin: 0;
`;

const Nav = styled.nav`
  grid-area: nav;
`;

const Article = styled.article`
  grid-area: article;
  overflow-y: scroll;
`;

function App() {
  return (
    <Router>
      <GridContainer>
        <Nav>
          <Sidebar />
        </Nav>
        <Article>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/blog" element={<Blog />} />
            <Route path="/faq" element={<Faq />} />
          </Routes>
        </Article>
      </GridContainer>
    </Router>
  );
}

export default App;
