/**
 * Base AI Provider - Abstract base class for all AI providers
 * Separated to avoid circular dependency with provider factory
 */
import { requestUrl } from 'obsidian';
/**
 * Base class for AI providers with common functionality
 */
export class BaseAIProvider {
    constructor(apiKey, model) {
        this.apiKey = apiKey;
        this.model = model;
    }
    /**
     * Make an HTTP request using Obsidian's requestUrl (CORS-free, mobile-compatible)
     */
    async makeRequest(url, options) {
        const response = await requestUrl({
            url,
            method: options.method || 'GET',
            headers: options.headers,
            body: options.body,
            throw: false,
        });
        return {
            status: response.status,
            text: response.text,
            json: response.json,
        };
    }
    /**
     * Simulate streaming by delivering the full response in small chunks.
     * This provides a typewriter effect in the UI while using non-streaming API calls.
     */
    simulateStream(fullContent, onChunk) {
        return new Promise((resolve) => {
            if (!fullContent) {
                resolve('');
                return;
            }
            // Deliver in chunks of ~3-5 characters for a natural typing feel
            const chunkSize = 4;
            let index = 0;
            const deliver = () => {
                if (index < fullContent.length) {
                    const end = Math.min(index + chunkSize, fullContent.length);
                    const chunk = fullContent.substring(index, end);
                    onChunk(chunk);
                    index = end;
                    setTimeout(deliver, 10);
                }
                else {
                    resolve(fullContent);
                }
            };
            deliver();
        });
    }
    /**
     * Format messages for API request (OpenAI-compatible format)
     */
    formatMessages(messages, systemPrompt) {
        const formattedMessages = [];
        // Add system prompt
        if (systemPrompt) {
            formattedMessages.push({
                role: 'system',
                content: systemPrompt,
            });
        }
        // Add conversation messages
        for (const message of messages) {
            formattedMessages.push({
                role: message.role,
                content: message.content,
            });
        }
        return formattedMessages;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmFzZS1wcm92aWRlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImJhc2UtcHJvdmlkZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztHQUdHO0FBRUgsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLFVBQVUsQ0FBQztBQUd0Qzs7R0FFRztBQUNILE1BQU0sT0FBZ0IsY0FBYztJQUtoQyxZQUFZLE1BQWMsRUFBRSxLQUFhO1FBQ3JDLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO1FBQ3JCLElBQUksQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDO0lBQ3ZCLENBQUM7SUFVRDs7T0FFRztJQUNPLEtBQUssQ0FBQyxXQUFXLENBQUMsR0FBVyxFQUFFLE9BSXhDO1FBQ0csTUFBTSxRQUFRLEdBQUcsTUFBTSxVQUFVLENBQUM7WUFDOUIsR0FBRztZQUNILE1BQU0sRUFBRSxPQUFPLENBQUMsTUFBTSxJQUFJLEtBQUs7WUFDL0IsT0FBTyxFQUFFLE9BQU8sQ0FBQyxPQUFPO1lBQ3hCLElBQUksRUFBRSxPQUFPLENBQUMsSUFBSTtZQUNsQixLQUFLLEVBQUUsS0FBSztTQUNmLENBQUMsQ0FBQztRQUNILE9BQU87WUFDSCxNQUFNLEVBQUUsUUFBUSxDQUFDLE1BQU07WUFDdkIsSUFBSSxFQUFFLFFBQVEsQ0FBQyxJQUFJO1lBQ25CLElBQUksRUFBRSxRQUFRLENBQUMsSUFBSTtTQUN0QixDQUFDO0lBQ04sQ0FBQztJQUVEOzs7T0FHRztJQUNPLGNBQWMsQ0FBQyxXQUFtQixFQUFFLE9BQXVCO1FBQ2pFLE9BQU8sSUFBSSxPQUFPLENBQUMsQ0FBQyxPQUFPLEVBQUUsRUFBRTtZQUMzQixJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7Z0JBQ2YsT0FBTyxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUNaLE9BQU87WUFDWCxDQUFDO1lBRUQsaUVBQWlFO1lBQ2pFLE1BQU0sU0FBUyxHQUFHLENBQUMsQ0FBQztZQUNwQixJQUFJLEtBQUssR0FBRyxDQUFDLENBQUM7WUFFZCxNQUFNLE9BQU8sR0FBRyxHQUFHLEVBQUU7Z0JBQ2pCLElBQUksS0FBSyxHQUFHLFdBQVcsQ0FBQyxNQUFNLEVBQUUsQ0FBQztvQkFDN0IsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLEdBQUcsU0FBUyxFQUFFLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQztvQkFDNUQsTUFBTSxLQUFLLEdBQUcsV0FBVyxDQUFDLFNBQVMsQ0FBQyxLQUFLLEVBQUUsR0FBRyxDQUFDLENBQUM7b0JBQ2hELE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQztvQkFDZixLQUFLLEdBQUcsR0FBRyxDQUFDO29CQUNaLFVBQVUsQ0FBQyxPQUFPLEVBQUUsRUFBRSxDQUFDLENBQUM7Z0JBQzVCLENBQUM7cUJBQU0sQ0FBQztvQkFDSixPQUFPLENBQUMsV0FBVyxDQUFDLENBQUM7Z0JBQ3pCLENBQUM7WUFDTCxDQUFDLENBQUM7WUFFRixPQUFPLEVBQUUsQ0FBQztRQUNkLENBQUMsQ0FBQyxDQUFDO0lBQ1AsQ0FBQztJQUVEOztPQUVHO0lBQ08sY0FBYyxDQUFDLFFBQXVCLEVBQUUsWUFBb0I7UUFJbEUsTUFBTSxpQkFBaUIsR0FBNkMsRUFBRSxDQUFDO1FBRXZFLG9CQUFvQjtRQUNwQixJQUFJLFlBQVksRUFBRSxDQUFDO1lBQ2YsaUJBQWlCLENBQUMsSUFBSSxDQUFDO2dCQUNuQixJQUFJLEVBQUUsUUFBUTtnQkFDZCxPQUFPLEVBQUUsWUFBWTthQUN4QixDQUFDLENBQUM7UUFDUCxDQUFDO1FBRUQsNEJBQTRCO1FBQzVCLEtBQUssTUFBTSxPQUFPLElBQUksUUFBUSxFQUFFLENBQUM7WUFDN0IsaUJBQWlCLENBQUMsSUFBSSxDQUFDO2dCQUNuQixJQUFJLEVBQUUsT0FBTyxDQUFDLElBQUk7Z0JBQ2xCLE9BQU8sRUFBRSxPQUFPLENBQUMsT0FBTzthQUMzQixDQUFDLENBQUM7UUFDUCxDQUFDO1FBRUQsT0FBTyxpQkFBaUIsQ0FBQztJQUM3QixDQUFDO0NBQ0oiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEJhc2UgQUkgUHJvdmlkZXIgLSBBYnN0cmFjdCBiYXNlIGNsYXNzIGZvciBhbGwgQUkgcHJvdmlkZXJzXG4gKiBTZXBhcmF0ZWQgdG8gYXZvaWQgY2lyY3VsYXIgZGVwZW5kZW5jeSB3aXRoIHByb3ZpZGVyIGZhY3RvcnlcbiAqL1xuXG5pbXBvcnQgeyByZXF1ZXN0VXJsIH0gZnJvbSAnb2JzaWRpYW4nO1xuaW1wb3J0IHsgQUlQcm92aWRlciwgQ2hhdE1lc3NhZ2UsIFN0cmVhbUNhbGxiYWNrIH0gZnJvbSAnLi4vdHlwZXMnO1xuXG4vKipcbiAqIEJhc2UgY2xhc3MgZm9yIEFJIHByb3ZpZGVycyB3aXRoIGNvbW1vbiBmdW5jdGlvbmFsaXR5XG4gKi9cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBCYXNlQUlQcm92aWRlciBpbXBsZW1lbnRzIEFJUHJvdmlkZXIge1xuICAgIGFic3RyYWN0IG5hbWU6IHN0cmluZztcbiAgICBwcm90ZWN0ZWQgYXBpS2V5OiBzdHJpbmc7XG4gICAgcHJvdGVjdGVkIG1vZGVsOiBzdHJpbmc7XG5cbiAgICBjb25zdHJ1Y3RvcihhcGlLZXk6IHN0cmluZywgbW9kZWw6IHN0cmluZykge1xuICAgICAgICB0aGlzLmFwaUtleSA9IGFwaUtleTtcbiAgICAgICAgdGhpcy5tb2RlbCA9IG1vZGVsO1xuICAgIH1cblxuICAgIGFic3RyYWN0IHNlbmRNZXNzYWdlKFxuICAgICAgICBtZXNzYWdlczogQ2hhdE1lc3NhZ2VbXSxcbiAgICAgICAgc3lzdGVtUHJvbXB0OiBzdHJpbmcsXG4gICAgICAgIG9uQ2h1bms6IFN0cmVhbUNhbGxiYWNrXG4gICAgKTogUHJvbWlzZTxzdHJpbmc+O1xuXG4gICAgYWJzdHJhY3QgdGVzdENvbm5lY3Rpb24oKTogUHJvbWlzZTxib29sZWFuPjtcblxuICAgIC8qKlxuICAgICAqIE1ha2UgYW4gSFRUUCByZXF1ZXN0IHVzaW5nIE9ic2lkaWFuJ3MgcmVxdWVzdFVybCAoQ09SUy1mcmVlLCBtb2JpbGUtY29tcGF0aWJsZSlcbiAgICAgKi9cbiAgICBwcm90ZWN0ZWQgYXN5bmMgbWFrZVJlcXVlc3QodXJsOiBzdHJpbmcsIG9wdGlvbnM6IHtcbiAgICAgICAgbWV0aG9kPzogc3RyaW5nO1xuICAgICAgICBoZWFkZXJzPzogUmVjb3JkPHN0cmluZywgc3RyaW5nPjtcbiAgICAgICAgYm9keT86IHN0cmluZztcbiAgICB9KTogUHJvbWlzZTx7IHN0YXR1czogbnVtYmVyOyB0ZXh0OiBzdHJpbmc7IGpzb246IHVua25vd24gfT4ge1xuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHJlcXVlc3RVcmwoe1xuICAgICAgICAgICAgdXJsLFxuICAgICAgICAgICAgbWV0aG9kOiBvcHRpb25zLm1ldGhvZCB8fCAnR0VUJyxcbiAgICAgICAgICAgIGhlYWRlcnM6IG9wdGlvbnMuaGVhZGVycyxcbiAgICAgICAgICAgIGJvZHk6IG9wdGlvbnMuYm9keSxcbiAgICAgICAgICAgIHRocm93OiBmYWxzZSxcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBzdGF0dXM6IHJlc3BvbnNlLnN0YXR1cyxcbiAgICAgICAgICAgIHRleHQ6IHJlc3BvbnNlLnRleHQsXG4gICAgICAgICAgICBqc29uOiByZXNwb25zZS5qc29uLFxuICAgICAgICB9O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNpbXVsYXRlIHN0cmVhbWluZyBieSBkZWxpdmVyaW5nIHRoZSBmdWxsIHJlc3BvbnNlIGluIHNtYWxsIGNodW5rcy5cbiAgICAgKiBUaGlzIHByb3ZpZGVzIGEgdHlwZXdyaXRlciBlZmZlY3QgaW4gdGhlIFVJIHdoaWxlIHVzaW5nIG5vbi1zdHJlYW1pbmcgQVBJIGNhbGxzLlxuICAgICAqL1xuICAgIHByb3RlY3RlZCBzaW11bGF0ZVN0cmVhbShmdWxsQ29udGVudDogc3RyaW5nLCBvbkNodW5rOiBTdHJlYW1DYWxsYmFjayk6IFByb21pc2U8c3RyaW5nPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgaWYgKCFmdWxsQ29udGVudCkge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoJycpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gRGVsaXZlciBpbiBjaHVua3Mgb2YgfjMtNSBjaGFyYWN0ZXJzIGZvciBhIG5hdHVyYWwgdHlwaW5nIGZlZWxcbiAgICAgICAgICAgIGNvbnN0IGNodW5rU2l6ZSA9IDQ7XG4gICAgICAgICAgICBsZXQgaW5kZXggPSAwO1xuXG4gICAgICAgICAgICBjb25zdCBkZWxpdmVyID0gKCkgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChpbmRleCA8IGZ1bGxDb250ZW50Lmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBlbmQgPSBNYXRoLm1pbihpbmRleCArIGNodW5rU2l6ZSwgZnVsbENvbnRlbnQubGVuZ3RoKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY2h1bmsgPSBmdWxsQ29udGVudC5zdWJzdHJpbmcoaW5kZXgsIGVuZCk7XG4gICAgICAgICAgICAgICAgICAgIG9uQ2h1bmsoY2h1bmspO1xuICAgICAgICAgICAgICAgICAgICBpbmRleCA9IGVuZDtcbiAgICAgICAgICAgICAgICAgICAgc2V0VGltZW91dChkZWxpdmVyLCAxMCk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShmdWxsQ29udGVudCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgZGVsaXZlcigpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBGb3JtYXQgbWVzc2FnZXMgZm9yIEFQSSByZXF1ZXN0IChPcGVuQUktY29tcGF0aWJsZSBmb3JtYXQpXG4gICAgICovXG4gICAgcHJvdGVjdGVkIGZvcm1hdE1lc3NhZ2VzKG1lc3NhZ2VzOiBDaGF0TWVzc2FnZVtdLCBzeXN0ZW1Qcm9tcHQ6IHN0cmluZyk6IEFycmF5PHtcbiAgICAgICAgcm9sZTogc3RyaW5nO1xuICAgICAgICBjb250ZW50OiBzdHJpbmc7XG4gICAgfT4ge1xuICAgICAgICBjb25zdCBmb3JtYXR0ZWRNZXNzYWdlczogQXJyYXk8eyByb2xlOiBzdHJpbmc7IGNvbnRlbnQ6IHN0cmluZyB9PiA9IFtdO1xuXG4gICAgICAgIC8vIEFkZCBzeXN0ZW0gcHJvbXB0XG4gICAgICAgIGlmIChzeXN0ZW1Qcm9tcHQpIHtcbiAgICAgICAgICAgIGZvcm1hdHRlZE1lc3NhZ2VzLnB1c2goe1xuICAgICAgICAgICAgICAgIHJvbGU6ICdzeXN0ZW0nLFxuICAgICAgICAgICAgICAgIGNvbnRlbnQ6IHN5c3RlbVByb21wdCxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gQWRkIGNvbnZlcnNhdGlvbiBtZXNzYWdlc1xuICAgICAgICBmb3IgKGNvbnN0IG1lc3NhZ2Ugb2YgbWVzc2FnZXMpIHtcbiAgICAgICAgICAgIGZvcm1hdHRlZE1lc3NhZ2VzLnB1c2goe1xuICAgICAgICAgICAgICAgIHJvbGU6IG1lc3NhZ2Uucm9sZSxcbiAgICAgICAgICAgICAgICBjb250ZW50OiBtZXNzYWdlLmNvbnRlbnQsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBmb3JtYXR0ZWRNZXNzYWdlcztcbiAgICB9XG59XG4iXX0=