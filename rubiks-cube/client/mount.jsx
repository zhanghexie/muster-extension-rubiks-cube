import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.jsx';
window.ma.ready.then(() => createRoot(document.getElementById('root')).render(<App />)).catch(error => { document.getElementById('root').textContent = error.message; });
