import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import styled from 'styled-components';
import Sidebar from './components/Sidebar';
import Home from './pages/Home';
import Blog from './pages/Blog';
import Faq from './pages/Faq';

const Main = styled.div`
  display: flex;
  height: 100vh;
  background-color: #2f2f2f;
  color: white;
`;

function App() {
  return (
    <Router>
      <Main>
        <Sidebar />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/blog" element={<Blog />} />
          <Route path="/faq" element={<Faq />} />
        </Routes>
      </Main>
    </Router>
  );
}

export default App;
