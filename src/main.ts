import App from './App.svelte';
import { mount } from 'svelte';
import '@fontsource-variable/inter';
import '@fontsource/material-symbols-outlined';
import './style.css';
import { applyPreferences, readPreferences } from './lib/preferences';
applyPreferences(readPreferences());

// Remove default Windows / WebView2 context menu globally across entire app
window.addEventListener('contextmenu', (e) => {
  e.preventDefault();
});

mount(App, { target: document.getElementById('app')! });
