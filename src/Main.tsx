import { faCompass, faDatabase, faHome, faPersonSkiing, faRoute, faUser, faWater } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { Suspense } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { GlobalToast, useProfile } from './ProfileContext';
import ErrorBoundary from './components/ErrorBoundary';
import ServiceStatusBanner from './components/ServiceStatusBanner';

// Every link goes somewhere real. The previous footer advertised a company that
// does not exist — Careers, Press, Investor Relations, Help Center, Cancellation
// Options — and pointed Terms of Service, Privacy Policy, Cookie Settings and
// Accessibility at the homepage. A legal link that silently returns you to the
// front page is worse than no link: it implies a policy that was never written.
// Those are gone until the pages exist; what is left is navigation, honest
// attribution for the open data this runs on, and a way to get in touch.
// A real, monitored inbox. The previous address was on the reserved .example
// TLD, which by definition can never receive mail — so both footer links were
// dead, which is precisely what the note above says not to ship.
const CONTACT_EMAIL = 'mailto:pinz92@gmail.com';

// The manual support loop for the narrow launch. Every price on the site is
// either scraped, estimated or third-party, so the honest position while there
// is no automated correction pipeline is to make a wrong figure one click away
// from a human. The subject and body are prefilled because a report with no
// page reference is almost always unactionable.
const REPORT_DATA_EMAIL = 'mailto:pinz92@gmail.com'
	+ '?subject=' + encodeURIComponent('TravelHub — wrong price or spot data')
	+ '&body=' + encodeURIComponent(
		'What looked wrong:\n\n\n'
		+ 'Where you saw it (paste the page address):\n\n\n'
		+ 'What the correct figure or detail should be, if you know:\n\n',
	);
// Primary navigation carries Home, Spots and Hack flights; the footer is the
// only in-app route to everything else, so it has to list all of it — including
// /ski-windows, which had no link anywhere before and was reachable only by
// typing the URL.
const footerSections = [
	{
		title: 'Also here',
		links: [
			{ label: 'Door-to-trip planner', href: '/explore' },
			{ label: 'Stay guide', href: '/stay-guide' },
			{ label: 'Island hop', href: '/island-hop' },
			{ label: 'Cost ledger', href: '/trip-ledger' },
		],
	},
	{
		title: 'Experimental',
		links: [
			{ label: 'Hack flights (no current prices)', href: '/hack-flights' },
		],
	},
	{
		title: 'Ski',
		links: [
			{ label: 'Ski resort map', href: '/ski-map' },
			{ label: 'Low-crowd ski weeks', href: '/ski-windows' },
			{ label: 'La Clusaz planner', href: '/resorts/la-clusaz' },
		],
	},
	{
		title: 'Your account',
		links: [
			{ label: 'Travel profile', href: '/profile' },
			{ label: 'How it works', href: '/' },
		],
	},
	{
		// Attribution is a licence condition for OpenStreetMap (ODbL), not a
		// courtesy — spot coordinates, access hints and the basemap all come
		// from it.
		title: 'Data sources',
		links: [
			{ label: 'OpenStreetMap contributors', href: 'https://www.openstreetmap.org/copyright' },
			{ label: 'Wikimedia Commons photos', href: 'https://commons.wikimedia.org/' },
			{ label: 'OurAirports dataset', href: 'https://ourairports.com/data/' },
			{ label: 'OpenFreeMap tiles', href: 'https://openfreemap.org/' },
			{ label: 'Airline logos by Kiwi.com', href: 'https://www.kiwi.com/' },
		],
	},
	{
		title: 'Contact',
		links: [
			{ label: 'Get in touch', href: CONTACT_EMAIL },
			{ label: 'Report a wrong price', href: REPORT_DATA_EMAIL },
		],
	},
	{
		title: 'Legal',
		links: [
			{ label: 'Privacy', href: '/privacy' },
			{ label: 'Terms', href: '/terms' },
			{ label: 'Cookies', href: '/cookies' },
		],
	},
];

// Primary navigation keeps the two activity maps within immediate reach.
//
// It was seven, one per half-finished module, which gave a first visitor seven
// ways to reach something that did not fully work and no way to tell which one
// was the point. The order here is the product:
//
//   Spots is the front door. A map of every cable park in Europe with the real
//   ways in — fly, ferry, train, and the drive at the end — is the one thing
//   here that exists nowhere else. Flight aggregators are a crowded field;
//   this is not.
//
//   Hack flights is the engine behind it, and stands on its own. It prices how
//   you actually reach a spot, extras included.
//
// The dedicated ski map remains available as the deeper, mountain-specific
// search surface. Labels stay short so the header still works on narrow screens.
// Hack Flights is deliberately NOT here. The beta ships as spot discovery,
// because the fare provider cannot state which dates its prices apply to — so
// no flight-to-park total can be stood behind. Promoting a route tool to
// primary navigation implies a pricing promise the data cannot support.
// It stays reachable from the footer, labelled experimental. Restore it here
// once fare coverage carries a travel window (see spot-readiness.js).
const navItems = [
	{ to: '/',        label: 'Home',    icon: faHome,  end: true  },
	{ to: '/spots',   label: 'Spots',   icon: faWater, end: false },
	{ to: '/ski-map', label: 'Ski map', icon: faPersonSkiing, end: false },
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
	const location = useLocation();
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
								<div className="brand-mark__title">
									TravelHub
									<span
										className="brand-mark__beta"
										title="Spot discovery is live: parks, setups and operator tariffs with the date each was checked. Flight-to-park pricing is not yet verified — our fare source cannot say which dates its prices apply to."
									>
										Beta · spot discovery
									</span>
								</div>
								<div className="brand-mark__subtitle">Find your next adventure</div>
							</div>
						</NavLink>
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
					</nav>

					{/* Account state lives on the right, the way every booking site does it —
					    it is status, not navigation, and mixing the two is what made the sync
					    badge crowd the wordmark. */}
					<div className="site-header__account">
						<span className={`header-sync-badge header-sync-badge--${syncState}`} title={`Profile sync: ${syncLabel}`}>
							<span className="header-sync-badge__dot" />
							<span className="header-sync-badge__label">{syncLabel}</span>
						</span>
						<NavLink
							to="/profile"
							className={({ isActive }) =>
								isActive ? 'account-button account-button--active' : 'account-button'
							}
						>
							<FontAwesomeIcon icon={faUser} className="account-button__icon" />
							<span>{isAuthenticated ? (account?.username ?? 'Profile') : 'Sign in'}</span>
						</NavLink>
					</div>
				</div>
			</header>

			<ServiceStatusBanner />

			<main className="site-main">
				<div className="page-container">
					{/* Keyed on the path so navigating away from a crashed page
					    clears the error — otherwise the boundary would hold the
					    fallback in place over whatever you moved to next. */}
					<ErrorBoundary key={location.pathname} scope="page">
						{/* Routes are code-split (see App.tsx), so the Outlet can
						    suspend. The boundary sits outside Suspense so a chunk
						    that fails to load is caught as an error rather than
						    hanging on the fallback forever. */}
						<Suspense fallback={<p className="route-loading" role="status" aria-live="polite">Loading…</p>}>
							<Outlet />
						</Suspense>
					</ErrorBoundary>
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
												<a
												className="footer-link"
												href={link.href}
												{...(link.href.startsWith('http')
													? { target: '_blank', rel: 'noopener noreferrer' }
													: {})}
											>
												{link.label}
											</a>
											)}
										</li>
									))}
								</ul>
							</div>
						))}
					</div>

					{/* These replace "Secure Booking / Best Price Guarantee / 24/7
					    Support" — none of which the product does. It takes no payment,
					    guarantees no price and staffs no support desk, and claiming
					    otherwise on a site whose argument is that travel companies are
					    not straight with you is the worst possible place to do it. */}
					<div className="footer-bottom">
						<p>© 2026 TravelHub</p>
						<div className="footer-badges">
							<span>No payment taken — you book with the operator</span>
							<span>Every cost labelled confirmed or estimated</span>
							<span>Map data © OpenStreetMap contributors (ODbL)</span>
							<span>
								Beta — spotted a wrong price?{' '}
								<a className="footer-inline-link" href={REPORT_DATA_EMAIL}>Tell us</a>
							</span>
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
