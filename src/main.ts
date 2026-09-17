import App from './App.svelte';
import { mount } from 'svelte';
import '@fontsource-variable/inter';
import '@fontsource/material-symbols-outlined';
import './style.css';
import { applyPreferences, readPreferences } from './lib/preferences';
applyPreferences(readPreferences());
mount(App, { target: document.getElementById('app')! });
