import { mount } from 'svelte'
import App from './App.svelte'
import './app.css'
import 'cesium/Build/Cesium/Widgets/widgets.css'

;(window as { CESIUM_BASE_URL?: string }).CESIUM_BASE_URL = `${import.meta.env.BASE_URL}cesium`
;(window as { CESIUM_ION_TOKEN?: string }).CESIUM_ION_TOKEN = import.meta.env.VITE_CESIUM_ION_TOKEN || ''

const app = mount(App, { target: document.getElementById('app')! })

export default app
