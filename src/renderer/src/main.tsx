import { createRoot } from 'react-dom/client';
import App from './App';
import './globals.css';
import 'highlight.js/styles/github-dark-dimmed.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found');
createRoot(container).render(<App />);
