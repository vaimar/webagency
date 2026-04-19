import { faCompass, faComments, faHome, faPlane } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';

const navigationItems = [
	{ to: '/', label: 'Home', icon: faHome },
	{ to: '/discover', label: 'Flights', icon: faPlane },
	{ to: '/planner', label: 'Trip Planner', icon: faCompass },
	{ to: '/assistant', label: 'AI Assistant', icon: faComments },
];

const footerSections = [
	{
		title: 'Company',
		links: ['About Us', 'Careers', 'Press', 'Blog', 'Investor Relations'],
	},
	{
		title: 'Support',
		links: ['Help Center', 'Contact Us', 'Safety Information', 'Cancellation Options', 'Report Concern'],
	},
	{
		title: 'Discover',
		links: ['Travel Guides', 'Flight Deals', 'Seasonal Offers', 'Travel Insurance', 'Car Rentals'],
	},
	{
		title: 'Legal',
		links: ['Terms of Service', 'Privacy Policy', 'Cookie Settings', 'Accessibility'],
	},
];

const Main: React.FC = () => {
	return (
		<div className="app-shell">
			<header className="site-header">
				<div className="page-container site-header__content">
					<NavLink to="/" className="brand-mark">
						<img src="/logo.png" alt="TravelHub" className="brand-mark__logo" />
						<div className="brand-mark__text">
							<div className="brand-mark__title">TravelHub</div>
							<div className="brand-mark__subtitle">Find your next adventure</div>
						</div>
					</NavLink>

					<nav className="site-nav" aria-label="Primary navigation">
						{navigationItems.map((item) => (
							<NavLink
								key={item.to}
								to={item.to}
								end={item.to === '/'}
								className={({ isActive }) =>
									isActive ? 'site-nav__link site-nav__link--active' : 'site-nav__link'
								}
							>
								<FontAwesomeIcon icon={item.icon} className="site-nav__icon" />
								<span>{item.label}</span>
							</NavLink>
						))}
					</nav>
				</div>
			</header>

			<main className="site-main">
				<div className="page-container">
					<Outlet />
				</div>
			</main>

			<footer className="site-footer">
				<div className="page-container">
					<div className="site-footer__content">
						{footerSections.map((section) => (
							<div key={section.title} className="footer-section">
								<h4 className="footer-section__title">{section.title}</h4>
								<ul className="footer-links">
									{section.links.map((link) => (
										<li key={link}>
											<span className="footer-link" style={{ cursor: 'pointer' }}>{link}</span>
										</li>
									))}
								</ul>
							</div>
						))}
					</div>

					<div className="footer-bottom">
						<p>© 2026 TravelHub. All rights reserved.</p>
						<div className="footer-badges">
							<span>🔒 Secure Booking</span>
							<span>💳 Best Price Guarantee</span>
							<span>🌍 24/7 Support</span>
						</div>
					</div>
				</div>
			</footer>
		</div>
	);
};

export default Main;

