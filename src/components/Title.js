import React, { useState } from 'react';
import styled from 'styled-components';
import logo from '../assets/logo.svg';
import Navbar from './Navbar';

const TitleWrapper = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100px;
  position: relative;
`;

const Logo = styled.img`
  height: 50px;
  cursor: pointer;
`;

const NavWrapper = styled.div`
  position: absolute;
  top: 100%;
  left: 0;
  width: 100%;
  display: none;

  @media screen and (max-width: 767px) {
    display: ${({ isNavOpen }) => (isNavOpen ? 'block' : 'none')};
  }
`;

function Title() {
  const [isNavOpen, setIsNavOpen] = useState(false);

  const toggleNav = () => {
    setIsNavOpen(!isNavOpen);
  };

  return (
    <TitleWrapper>
      <Logo src={logo} alt="logo" onClick={toggleNav} />
      <NavWrapper isNavOpen={isNavOpen}>
        <Navbar />
      </NavWrapper>
    </TitleWrapper>
  );
}

export default Title;
