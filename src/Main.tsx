import { faCompass, faDatabase, faHome, faRoute, faShip, faUser } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { GlobalToast, useProfile } from './ProfileContext';

// Every link resolves to a real destination — app routes for the functional
// ones, mailto for contact. No dead placeholder spans.
const CONTACT_EMAIL = 'mailto:hello@travelhub.example';
const footerSections = [
	{
		title: 'Company',
		links: [
			{ label: 'About Us', href: '/' },
			{ label: 'Careers', href: CONTACT_EMAIL },
			{ label: 'Press', href: CONTACT_EMAIL },
			{ label: 'Blog', href: '/' },
			{ label: 'Investor Relations', href: CONTACT_EMAIL },
		],
	},
	{
		title: 'Support',
		links: [
			{ label: 'Help Center', href: '/' },
			{ label: 'Contact Us', href: CONTACT_EMAIL },
			{ label: 'Safety Information', href: '/' },
			{ label: 'Cancellation Options', href: '/' },
			{ label: 'Report Concern', href: CONTACT_EMAIL },
		],
	},
	{
		title: 'Discover',
		links: [
			{ label: 'Travel Guides', href: '/explore' },
			{ label: 'Flight Deals', href: '/explore' },
			{ label: 'Island Hopping', href: '/island-hop' },
			{ label: 'Seasonal Offers', href: '/explore' },
			{ label: 'Car Rentals', href: '/' },
		],
	},
	{
		title: 'Legal',
		links: [
			{ label: 'Terms of Service', href: '/' },
			{ label: 'Privacy Policy', href: '/' },
			{ label: 'Cookie Settings', href: '/' },
			{ label: 'Accessibility', href: '/' },
		],
	},
];

// Unified: /explore is the single door-to-door trip flow (flights, stays,
// activities, restaurants, trip total). /discover and /planner redirect into it.
const navItems = [
	{ to: '/',            label: 'Home',         icon: faHome,     end: true  },
	{ to: '/explore',     label: 'Door-to-trip', icon: faRoute,    end: false },
	{ to: '/island-hop',  label: 'Island Hop',   icon: faShip,     end: false },
];

const toastMeta = (toast: GlobalToast) => {
	switch (toast.source) {
		case 'planner':
			return { icon: faCompass, label: 'Planner' };
		case 'assistant':
				return { icon: faRoute, label: 'Guide' };
		case 'auth':
				return { icon: faUser, label: 'Account' };
		default:
			return { icon: faDatabase, label: 'Sync' };
	}
};

const Main: React.FC = () => {
	const { account, isAuthenticated, syncState, toasts, dismissToast } = useProfile();
	const syncLabel = syncState === 'synced'
		? 'Base sync'
		: syncState === 'syncing'
			? 'Sync...'
			: syncState === 'error'
				? 'Sync error'
				: 'Anonymous';

	return (
		<div className="app-shell">
			{toasts.length > 0 && (
				<div className="global-toast-stack" aria-live="polite" aria-atomic="false">
					{toasts.map((toast) => {
						const meta = toastMeta(toast);
						return (
							<div key={toast.id} className={`global-toast global-toast--${toast.type} global-toast--${toast.source}`} role="status">
								<div className="global-toast__icon" aria-hidden="true">
									<FontAwesomeIcon icon={meta.icon} />
								</div>
								<div className="global-toast__content">
									<div className="global-toast__meta">
										<span className={`global-toast__source global-toast__source--${toast.source}`}>{meta.label}</span>
													<strong>{toast.title ?? (toast.type === 'success' ? 'Action completed' : toast.type === 'error' ? 'Something went wrong' : 'Information')}</strong>
									</div>
									<span>{toast.message}</span>
								</div>
											<button type="button" className="global-toast__close" onClick={() => dismissToast(toast.id)} aria-label="Close notification">×</button>
							</div>
						);
					})}
				</div>
			)}
			<header className="site-header">
				<div className="page-container site-header__content">
					<div className="site-header__brand-group">
						<NavLink to="/" className="brand-mark">
							<img src="/logo.png" alt="TravelHub" className="brand-mark__logo" />
							<div className="brand-mark__text">
								<div className="brand-mark__title">TravelHub</div>
								<div className="brand-mark__subtitle">Find your next adventure</div>
							</div>
						</NavLink>
						<span className={`header-sync-badge header-sync-badge--${syncState}`}>
							<span className="header-sync-badge__dot" />
							{syncLabel}
						</span>
					</div>

					<nav className="site-nav" aria-label="Primary navigation">
						{navItems.map((item) => (
							<NavLink
								key={item.to}
								to={item.to}
								end={item.end}
								className={({ isActive }) =>
									isActive ? 'site-nav__link site-nav__link--active' : 'site-nav__link'
								}
							>
								<FontAwesomeIcon icon={item.icon} className="site-nav__icon" />
								<span>{item.label}</span>
							</NavLink>
						))}

						{/* Profile / Sign-in link */}
						<NavLink
							to="/profile"
							className={({ isActive }) =>
								isActive ? 'site-nav__link site-nav__link--active' : 'site-nav__link'
							}
						>
							<FontAwesomeIcon icon={faUser} className="site-nav__icon" />
							<span>{isAuthenticated ? (account?.username ?? 'Profile') : 'Sign in'}</span>
							{isAuthenticated && <span className={`site-nav__status site-nav__status--${syncState}`}>{syncLabel}</span>}
						</NavLink>
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
										<li key={link.label}>
											{link.href.startsWith('/') ? (
												<Link className="footer-link" to={link.href}>{link.label}</Link>
											) : (
												<a className="footer-link" href={link.href}>{link.label}</a>
											)}
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

			{/* Mobile bottom navigation */}
			<nav className="mobile-bottom-nav" aria-label="Mobile navigation">
				{navItems.map((item) => (
					<NavLink
						key={item.to}
						to={item.to}
						end={item.end}
						className={({ isActive }) =>
							isActive ? 'mobile-bottom-nav__item mobile-bottom-nav__item--active' : 'mobile-bottom-nav__item'
						}
					>
						<FontAwesomeIcon icon={item.icon} className="mobile-bottom-nav__icon" />
						<span className="mobile-bottom-nav__label">{item.label}</span>
					</NavLink>
				))}
				<NavLink
					to="/profile"
					className={({ isActive }) =>
						isActive ? 'mobile-bottom-nav__item mobile-bottom-nav__item--active' : 'mobile-bottom-nav__item'
					}
				>
					<FontAwesomeIcon icon={faUser} className="mobile-bottom-nav__icon" />
					<span className="mobile-bottom-nav__label">
						{isAuthenticated ? (account?.username ?? 'Profile') : 'Sign in'}
					</span>
				</NavLink>
			</nav>
		</div>
	);
};

export default Main;
