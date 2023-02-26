import React from 'react';
import styled from 'styled-components';
import { Link, useLocation } from 'react-router-dom';

import Logo from '../assets/logo.svg';

const Wrapper = styled.div`
  display: flex;
  flex-shrink: 0;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  width: 200px;
  background-color: #713491;
  padding: 20px;
  overflow-y: auto;
`;

const LogoImg = styled.img`
  width: 100%;
  height: auto;
`;

const Nav = styled.nav`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin-top: 20px;

  &::before {
    content: "";
    display: block;
    height: 2px;
    width: 180px;
    background-color: #fd46d6;
    margin-bottom: 20px;
  }
`;

const NavLink = styled(Link)`
  width: 90%;
  margin-bottom: 10px;
  padding: 10px 20px;
  color: #fd46d6;
  font-size: 20px;
  font-weight: bold;
  text-decoration: none;
  background-color: ${({ active }) => active ? '#11cef6' : '#f8e03e'};
  border-radius: 5px;
  transition: background-color 0.4s ease, color 0.4s ease;
  justify-content: center;
  display: flex;

  &:hover {
    background-color: ${({ active }) => active ? '#fd46d6' : '#fd46d6'};
    color: #f8e03e;
  }
`;

function Sidebar() {
  const location = useLocation();

  return (
    <Wrapper>
      <LogoImg src={Logo} alt="logo" />
      <Nav>
        <NavLink to="/" active={location.pathname === '/'}>HOME</NavLink>
        <NavLink to="/projects" active={location.pathname === '/projects'}>PROJECTS</NavLink>
        <NavLink to="/blog" active={location.pathname === '/blog'}>BLOG</NavLink>
        <NavLink to="/faq" active={location.pathname === '/faq'}>FAQ</NavLink>
      </Nav>
    </Wrapper>
  );
}

export default Sidebar;
