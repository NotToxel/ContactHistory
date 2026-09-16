import App from './App.svelte';
import { mount } from 'svelte';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/manrope';
import './style.css';
mount(App, { target: document.getElementById('app')! });
