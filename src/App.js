import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import styled from 'styled-components';
import Sidebar from './components/Sidebar';
import Home from './pages/Home';
import Blog from './pages/Blog';
import Faq from './pages/Faq';
import './App.css';

const Nav = styled.nav`
  grid-area: nav;
`;

const Article = styled.article`
  grid-area: article;
  height: 100%;
`;

function App() {
  return (
    <Router>
      <div className="App">
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
      </div>
    </Router>
  );
}

export default App;
