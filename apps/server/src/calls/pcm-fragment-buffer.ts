export class PcmFragmentBuffer {
  private chunks: Buffer[] = [];
  private bytes = 0;

  constructor(private readonly fragmentBytes: number) {}

  append(pcm: Buffer): Buffer[] {
    if (pcm.length === 0) {
      return [];
    }

    this.chunks.push(pcm);
    this.bytes += pcm.length;
    const flushed: Buffer[] = [];

    while (this.bytes >= this.fragmentBytes) {
      flushed.push(this.take(this.fragmentBytes));
    }

    return flushed;
  }

  flushRemainder(): Buffer | null {
    if (this.bytes === 0) {
      return null;
    }

    return this.take(this.bytes);
  }

  get bufferedBytes(): number {
    return this.bytes;
  }

  private take(count: number): Buffer {
    const out = Buffer.allocUnsafe(count);
    let offset = 0;

    while (offset < count && this.chunks.length > 0) {
      const head = this.chunks[0]!;
      const need = count - offset;
      if (head.length <= need) {
        head.copy(out, offset);
        offset += head.length;
        this.chunks.shift();
      } else {
        head.copy(out, offset, 0, need);
        this.chunks[0] = head.subarray(need);
        offset += need;
      }
    }

    this.bytes -= count;
    return out;
  }
}
