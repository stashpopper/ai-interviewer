import "styles/globals.css"
import { Landing } from "./components/Landing";
import { Form } from "./components/Form";
import { Interview } from "./components/Interview";
import { Result } from "./components/Result";
import { Toaster } from "sonner";
import { BrowserRouter, Routes, Route } from "react-router";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/start" element={<Form />} />
        <Route path="/interview/:interviewId" element={<Interview />} />
        <Route path="/result" element={<Result />} />
      </Routes>
      <Toaster position="bottom-left" />
    </BrowserRouter>
  );
}

export default App;
