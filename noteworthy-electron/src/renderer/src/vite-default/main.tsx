import { render } from 'solid-js/web'
import '../assets/vite-electron.css'
import App from './App'

render(() => <App />, document.getElementById('main') as HTMLElement)
