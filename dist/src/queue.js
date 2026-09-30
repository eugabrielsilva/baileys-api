"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("./utils");
class Queue {
    static jobs = [];
    static running = false;
    static add(callback) {
        this.jobs.push({
            callback,
            delay: this.randomDelay()
        });
        this.run();
    }
    static async run() {
        if (this.running || this.jobs.length === 0) {
            return;
        }
        this.running = true;
        while (this.jobs.length > 0) {
            const job = this.jobs.shift();
            try {
                await this.sleep(job.delay);
                await job.callback();
            }
            catch (error) {
                (0, utils_1.logger)('error', 'Failed to process queue job:', error);
            }
        }
        this.running = false;
    }
    static randomDelay() {
        const minDelay = parseInt(process.env.QUEUE_MIN_DELAY || '2500');
        const maxDelay = parseInt(process.env.QUEUE_MAX_DELAY || '5000');
        return Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
    }
    static sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
exports.default = Queue;
