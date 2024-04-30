/* @refresh reload */
import { render } from 'solid-js/web'

import './index.css'
import App from './App'

import { data } from "../lib/main.ts";
console.log(data);

const root = document.getElementById('root')

render(() => <App />, root!)
