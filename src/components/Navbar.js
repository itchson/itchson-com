import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import './navbar.css';
import logo from '../assets/logo.svg';

function Navbar() {
  const location = useLocation();
  const [isNavOpen, setIsNavOpen] = useState(false);

  const toggleNav = () => {
    setIsNavOpen(!isNavOpen);
  };

  return (
    <nav className={`navbar ${isNavOpen ? 'open' : ''}`}>
      <div className="nav-logo">
        <img src={logo} alt="Logo" />
      </div>
      <div className="nav-toggle" onClick={toggleNav}>
        <span></span>
        <span></span>
        <span></span>
      </div>
      <div className="nav-links-wrapper">
        <hr className="nav-line-break" />
        <NavLink to="/" label="HOME" active={location.pathname === '/'} />
        <NavLink to="/blog" label="BLOG" active={location.pathname === '/blog'} />
        <NavLink to="/faq" label="FAQ" active={location.pathname === '/faq'} />
      </div>
    </nav>
  );
}

function NavLink(props) {
  const { to, label, active } = props;

  return (
    <Link to={to} className={`nav-link ${active ? 'active' : ''}`}>
      {label}
    </Link>
  );
}

export default Navbar;
