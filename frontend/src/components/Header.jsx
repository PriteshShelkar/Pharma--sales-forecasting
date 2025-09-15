import React from 'react';
import { Link, useLocation } from 'react-router-dom';

const Header = () => {
  const location = useLocation();

  return (
    <header className="header">
      <div className="header-content">
        <h1 className="logo">🏥 Pharma Sales Analytics</h1>
        <nav className="nav">
          <Link 
            to="/" 
            className={location.pathname === '/' ? 'nav-link active' : 'nav-link'}
          >
            📊 Dashboard
          </Link>
          <Link 
            to="/upload" 
            className={location.pathname === '/upload' ? 'nav-link active' : 'nav-link'}
          >
            📁 Upload Data
          </Link>
          <Link 
            to="/predict" 
            className={location.pathname === '/forecast' ? 'nav-link active' : 'nav-link'}
          >
            📈 Forecasting
          </Link>
          <Link 
            to="/analytics" 
            className={location.pathname === '/analytics' ? 'nav-link active' : 'nav-link'}
          >
            📋 Analytics
          </Link>
        </nav>
      </div>
    </header>
  );
};

export default Header;
