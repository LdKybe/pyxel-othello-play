// Transport and lifetime only; game and search stay in Python.
(() => {
    const workerURL = new URL("./cpu-worker.js", document.currentScript.src);
    class WorkerBridge {
        constructor() {
            this.closed = false;
            this.ready = false;
            this.current = null;
            this.pending = null;
            this.results = [];
            const worker = new Worker(workerURL, {type: "module"});
            this.worker = worker;
            worker.onmessage = ({data}) => {
                if (this.closed || this.worker !== worker) return;
                if (data.type === "ready") {
                    if (this.ready) return;
                    this.ready = true;
                    if (this.pending) worker.postMessage(this.pending);
                    this.pending = null;
                } else if (data.type === "error") {
                    this.fail(data.message);
                } else {
                    this.results.push(data);
                }
            };
            worker.onerror = event => {
                if (this.closed || this.worker !== worker) return;
                event.preventDefault();
                this.fail(event.message || "Worker failed");
            };
        }
        fail(message) {
            this.results.push({type:"error", game_id:this.current?.game_id ?? 0,
                revision:this.current?.revision ?? 0, message:String(message)});
        }
        open() {
            if (this.closed) throw new Error("Worker is closed");
        }
        send(raw) {
            this.open();
            const data = JSON.parse(raw);
            this.current = data;
            if (this.ready) {
                this.worker.postMessage(data);
            } else if (data.type === "start") {
                this.pending = data;
            } else if (data.type === "update" && this.pending) {
                if (data.game_id !== this.pending.game_id) throw new Error("game_id mismatch");
                if (data.revision < this.pending.revision) return;
                if (data.revision === this.pending.revision &&
                    (data.black !== this.pending.black || data.white !== this.pending.white || data.to_move !== this.pending.to_move)) {
                    throw new Error("same revision with different position");
                }
                this.pending = {...this.pending, ...data, type:"start"};
            } else {
                throw new Error("start required");
            }
        }
        poll() {
            this.open();
            const result = this.results.shift();
            return result === undefined ? "" : JSON.stringify(result);
        }
        close() {
            if (this.closed) return;
            this.closed = true;
            this.worker.terminate();
            this.worker = null;
            this.pending = this.current = null;
            this.results = [];
        }
    }
    globalThis.createOthelloWorker = () => new WorkerBridge();
})();
