type WorkerReply = { id: number, type: string, [key: string]: unknown }

export class SimulationWorkerClient {
  private worker = new Worker(new URL('./simulation.worker.ts', import.meta.url), { type: 'module' })
  private nextId = 1
  private pending = new Map<number, { resolve: (value: WorkerReply) => void, reject: (reason: Error) => void, progress?: (fraction: number) => void }>()

  constructor() {
    this.worker.onmessage = (event: MessageEvent<WorkerReply>) => {
      const reply = event.data
      const pending = this.pending.get(reply.id)
      if (!pending) return
      if (reply.type === 'progress') {
        pending.progress?.(Number(reply.fraction))
        return
      }
      this.pending.delete(reply.id)
      if (reply.type === 'error') pending.reject(new Error(String(reply.error)))
      else pending.resolve(reply)
    }
  }

  request(payload: Record<string, unknown>, progress?: (fraction: number) => void): Promise<WorkerReply> {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, progress })
      this.worker.postMessage({ ...payload, id })
    })
  }

  terminate(): void {
    this.worker.terminate()
  }
}
