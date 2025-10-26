import React, { useEffect, useState } from 'react';


const PIN_KEY = 'ahv_auth_ok';


export default function LoginGate({ children }) {
const [ok, setOk] = useState(false);
const [pin, setPin] = useState('');
const configuredPin = import.meta.env.VITE_APP_PIN || '1234';


useEffect(() => {
const stored = localStorage.getItem(PIN_KEY);
if (stored === '1') setOk(true);
}, []);


function tryLogin(e) {
e.preventDefault();
if (pin === String(configuredPin)) {
localStorage.setItem(PIN_KEY, '1');
setOk(true);
} else {
alert('Invalid PIN');
}
}


function logout() {
localStorage.removeItem(PIN_KEY);
setOk(false);
setPin('');
}


if (!ok) {
return (
<div className="min-h-screen flex items-center justify-center bg-gray-100 p-6">
<form onSubmit={tryLogin} className="bg-white max-w-sm w-full rounded-2xl shadow p-6 space-y-4">
<h1 className="text-xl font-semibold">Enter PIN</h1>
<input
className="w-full border rounded-xl px-3 py-2"
type="password"
inputMode="numeric"
placeholder="PIN"
value={pin}
onChange={(e) => setPin(e.target.value)}
autoFocus
/>
<button className="w-full bg-black text-white rounded-xl py-2">Unlock</button>
<p className="text-xs text-gray-500">Set your PIN in <code>.env.local</code> → <code>VITE_APP_PIN</code></p>
</form>
</div>
);
}


return (
<div>
<div className="fixed top-3 right-3">
<button onClick={logout} className="text-xs border rounded-lg px-2 py-1 bg-white">Logout</button>
</div>
{children}
</div>
);
}