// Only transport and lifetime management; Othello logic stays in Python.
(() => {
    const workerURL = new URL("./cpu-worker.js", document.currentScript.src);
    class WorkerBridge {
        constructor() {
            this.worker = null;
            this.ready = false;
            this.active = null;
            this.result = null;
            this.failure = null;
            this.closed = false;
            this.spawn();
        }
        spawn() {
            if (this.worker || this.closed) return;
            const worker = new Worker(workerURL, {type: "module"});
            this.worker = worker;
            this.ready = false;
            worker.onmessage = ({data}) => {
                if (this.worker !== worker || this.closed) return;
                if (data.type === "ready") {
                    this.ready = true;
                    if (this.active) worker.postMessage(this.active);
                } else if (data.type === "error") {
                    this.failure = data.error;
                } else if (this.active && data.id === this.active.id) {
                    this.result = data;
                    this.active = null;
                }
            };
            worker.onerror = (event) => {
                if (this.worker !== worker || this.closed) return;
                event.preventDefault();
                this.failure = event.message || "Worker failed";
            };
        }
        submit(raw) {
            if (this.closed) throw new Error("Worker is closed");
            if (this.active || this.result) throw new Error("Worker is busy");
            this.active = JSON.parse(raw);
            this.spawn();
            if (this.ready) this.worker.postMessage(this.active);
        }
        poll() {
            if (this.failure !== null) {
                const error = this.failure;
                this.failure = null;
                return JSON.stringify({error});
            }
            const result = this.result;
            this.result = null;
            return result === null ? "" : JSON.stringify(result);
        }
        cancel() {
            if ((this.active || this.failure) && this.worker) {
                this.worker.terminate();
                this.worker = null;
                this.ready = false;
            }
            this.active = null;
            this.result = null;
            this.failure = null;
        }
        close() {
            this.closed = true;
            if (this.worker) this.worker.terminate();
            this.worker = null;
            this.active = null;
            this.result = null;
            this.failure = null;
        }
    }
    globalThis.othelloWorker = new WorkerBridge();
})();
