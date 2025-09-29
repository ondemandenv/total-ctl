import "./App.scss"
import { useEffect, useRef, useState } from "react"
import VideoAnalyzer from "./components/VideoAnalyzer/VideoAnalyzer"

function App() {
  const initializedRef = useRef(false)
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true
      setMounted(true)
    }
  }, [])
  return mounted ? <VideoAnalyzer /> : null
}

export default App
