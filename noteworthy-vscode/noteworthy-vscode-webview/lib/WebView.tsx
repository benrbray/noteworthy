import { createSignal } from "solid-js";

export const WebView = () => {
  const [count, setCount] = createSignal(0);

  return <div>
    <button onClick={() => setCount(c => c+1)}>Increment</button>
    The count is {count()}
  </div>;
}