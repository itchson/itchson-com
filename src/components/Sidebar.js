import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import Logo from '../assets/logo.svg';
import './sidebar.css';

function Sidebar() {
  const location = useLocation();

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="logo-wrapper">
          <img className="logo" src={Logo} alt="logo" />
        </div>
      </div>
      <nav className={`nav`}>
      <hr class="nav-line-break" />
        <NavLink to="/" label="HOME" active={location.pathname === '/'} />
        <NavLink to="/projects" label="PROJECTS" active={location.pathname === '/projects'} />
        <NavLink to="/blog" label="BLOG" active={location.pathname === '/blog'} />
        <NavLink to="/faq" label="FAQ" active={location.pathname === '/faq'} />
      </nav>
    </div>
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

export default Sidebar;
