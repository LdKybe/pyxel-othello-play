// Transport and lifetime only. The payload remains an opaque UTF-8 string.
(() => {
    const workerURL = new URL("./cpu-worker.js", document.currentScript.src);
    class WorkerBridge {
        constructor(sessionId) {
            if (typeof sessionId !== "string") throw new TypeError("Session ID must be a string");
            this.closed = false;
            this.results = [];
            this.error = null;
            const url = new URL(workerURL);
            url.searchParams.set("session", sessionId);
            const worker = new Worker(url, {type: "module"});
            this.worker = worker;
            worker.onmessage = ({data}) => {
                if (this.closed || this.worker !== worker || this.error !== null) return;
                if (typeof data === "string") this.results.push(data);
                else if (data && typeof data.transport_error === "string") this.error = data.transport_error;
                else this.error = "Worker returned a non-string message";
            };
            worker.onerror = event => {
                if (this.closed || this.worker !== worker) return;
                event.preventDefault();
                this.error ??= event.message || "Worker failed";
            };
            worker.onmessageerror = () => {
                if (!this.closed && this.worker === worker) this.error ??= "Worker message could not be received";
            };
        }
        open() {
            if (this.closed) throw new Error("Worker is closed");
        }
        send(raw) {
            this.open();
            if (this.error !== null) throw new Error(this.error);
            if (typeof raw !== "string") throw new TypeError("Worker request must be a string");
            this.worker.postMessage(raw);
        }
        poll() {
            this.open();
            if (this.results.length) return this.results.shift();
            if (this.error !== null) throw new Error(this.error);
            return "";
        }
        close() {
            this.closed = true;
            this.results = [];
            if (this.worker === null) return;
            this.worker.terminate();
            this.worker = null;
        }
    }
    globalThis.createOthelloWorker = sessionId => new WorkerBridge(sessionId);
})();
