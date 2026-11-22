import { StrictMode, Component, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import App from './App';
import './styles.css';

class ErrorBoundary extends Component<{children:ReactNode},{error:boolean}> {
  state = {error:false};
  static getDerivedStateFromError(){return {error:true};}
  render(){if(this.state.error)return <main className="fatal-error"><img src="/favicon.svg" alt="" width="56"/><h1>Could not open Cuebase</h1><p>Reload to try again.</p><button className="btn btn-primary" onClick={()=>location.reload()}>Reload Cuebase</button></main>;return this.props.children;}
}
const root=createRoot(document.getElementById('root')!);
if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount());
root.render(<StrictMode><ErrorBoundary><App/></ErrorBoundary></StrictMode>);
