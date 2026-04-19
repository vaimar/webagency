import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';

const navigationItems = [
	{ to: '/', label: 'Overview' },
	{ to: '/discover', label: 'Discover fares' },
	{ to: '/planner', label: 'Travel planner' },
];

const Main: React.FC = () => {
	return (
		<div className="app-shell">
			<header className="site-header">
				<div className="page-container site-header__content">
					<NavLink to="/" className="brand-mark">
						<img src="/logo.png" alt="Webagency logo" className="brand-mark__logo" />
						<div>
							<div className="brand-mark__title">Webagency</div>
							<div className="brand-mark__subtitle">A refreshed travel planning studio</div>
						</div>
					</NavLink>

					<nav className="site-nav" aria-label="Primary">
						{navigationItems.map((item) => (
							<NavLink
								key={item.to}
								to={item.to}
								end={item.to === '/'}
								className={({ isActive }) =>
									isActive ? 'site-nav__link site-nav__link--active' : 'site-nav__link'
								}
							>
								{item.label}
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
				<div className="page-container site-footer__content">
					<p>Refactored into a typed, cache-aware React app with a cleaner UX.</p>
					<p className="muted-text">Live fares are optional; the planner remains fully useful offline.</p>
				</div>
			</footer>
		</div>
	);
};

export default Main;

