import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import About from './About';
import './App.css';
import Assistant from './Assistant';
import { CacheProvider } from './CacheContext';
import Home from './Home';
import Main from './Main';
import Profile from './Profile';
import { ProfileProvider } from './ProfileContext';
import TravelForm from './TravelForm';

const App: React.FC = () => {
    return (
        <CacheProvider>
            <ProfileProvider>
                <BrowserRouter>
                    <Routes>
                        <Route element={<Main />}>
                            <Route index element={<About />} />
                            <Route path="discover" element={<Home />} />
                            <Route path="planner" element={<TravelForm />} />
                            <Route path="assistant" element={<Assistant />} />
                            <Route path="profile" element={<Profile />} />
                            <Route path="*" element={<Navigate to="/" replace />} />
                        </Route>
                    </Routes>
                </BrowserRouter>
            </ProfileProvider>
        </CacheProvider>
    );
};

export default App;
