import React from 'react';
import { createRoot } from 'react-dom/client';
import MainApp from './MainApp.jsx';
import LoginGate from './LoginGate.jsx';
import './index.css';


function Root() {
return (
<React.StrictMode>
<LoginGate>
<MainApp />
</LoginGate>
</React.StrictMode>
);
}


createRoot(document.getElementById('root')).render(<Root />);