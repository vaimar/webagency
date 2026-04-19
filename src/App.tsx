import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import About from './About';
import './App.css';
import { CacheProvider } from './CacheContext';
import Home from './Home';
import Main from './Main';
import TravelForm from './TravelForm';

const App: React.FC = () => {
    return (
        <CacheProvider>
            <BrowserRouter>
                <Routes>
                    <Route element={<Main />}>
                        <Route index element={<About />} />
                        <Route path="discover" element={<Home />} />
                        <Route path="planner" element={<TravelForm />} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Route>
                </Routes>
            </BrowserRouter>
        </CacheProvider>
    );
};

export default App;
