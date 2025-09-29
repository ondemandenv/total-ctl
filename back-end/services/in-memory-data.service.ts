/**
 * In-memory data service for testing/development environments
 * Provides a simple in-memory storage that mimics MongoDB operations
 */

export interface InMemoryDocument {
    _id: string;
    createdAt?: Date;
    updatedAt?: Date;
    [key: string]: any;
}

export interface QueryOptions {
    limit?: number;
    skip?: number;
    sort?: { [key: string]: 1 | -1 };
}

export class InMemoryDataStore {
    private collections: Map<string, Map<string, InMemoryDocument>> = new Map();
    private idCounters: Map<string, number> = new Map();

    constructor() {
        console.log('🧠 Initializing in-memory data store for testing environment');
    }

    /**
     * Get or create a collection
     */
    private getCollection(collectionName: string): Map<string, InMemoryDocument> {
        if (!this.collections.has(collectionName)) {
            this.collections.set(collectionName, new Map());
            this.idCounters.set(collectionName, 0);
        }
        return this.collections.get(collectionName)!;
    }

    /**
     * Generate a unique ID for a document
     */
    private generateId(collectionName: string): string {
        const counter = this.idCounters.get(collectionName) || 0;
        this.idCounters.set(collectionName, counter + 1);
        return `inmem_${collectionName}_${counter + 1}_${Date.now()}`;
    }

    /**
     * Create a new document
     */
    async create(collectionName: string, data: Omit<InMemoryDocument, '_id'>): Promise<InMemoryDocument> {
        const collection = this.getCollection(collectionName);
        const id = this.generateId(collectionName);
        const now = new Date();
        
        const document: InMemoryDocument = {
            ...data,
            _id: id,
            createdAt: now,
            updatedAt: now
        };

        collection.set(id, document);
        console.log(`📝 Created document in ${collectionName}: ${id}`);
        return document;
    }

    /**
     * Find documents by query
     */
    async find(collectionName: string, query: Partial<InMemoryDocument> = {}, options: QueryOptions = {}): Promise<InMemoryDocument[]> {
        const collection = this.getCollection(collectionName);
        let results = Array.from(collection.values());

        // Apply query filters
        if (Object.keys(query).length > 0) {
            results = results.filter(doc => {
                return Object.entries(query).every(([key, value]) => {
                    if (Array.isArray(value)) {
                        return Array.isArray(doc[key]) && value.every(v => doc[key].includes(v));
                    }
                    return doc[key] === value;
                });
            });
        }

        // Apply sorting
        if (options.sort) {
            const sortEntries = Object.entries(options.sort);
            results.sort((a, b) => {
                for (const [field, direction] of sortEntries) {
                    const aVal = a[field];
                    const bVal = b[field];
                    if (aVal < bVal) return direction === 1 ? -1 : 1;
                    if (aVal > bVal) return direction === 1 ? 1 : -1;
                }
                return 0;
            });
        }

        // Apply pagination
        if (options.skip) {
            results = results.slice(options.skip);
        }
        if (options.limit) {
            results = results.slice(0, options.limit);
        }

        console.log(`🔍 Found ${results.length} documents in ${collectionName}`);
        return results;
    }

    /**
     * Find a single document
     */
    async findOne(collectionName: string, query: Partial<InMemoryDocument>): Promise<InMemoryDocument | null> {
        const results = await this.find(collectionName, query, { limit: 1 });
        return results.length > 0 ? results[0] : null;
    }

    /**
     * Find document by ID
     */
    async findById(collectionName: string, id: string): Promise<InMemoryDocument | null> {
        const collection = this.getCollection(collectionName);
        return collection.get(id) || null;
    }

    /**
     * Update a document by ID
     */
    async updateById(collectionName: string, id: string, update: Partial<InMemoryDocument>): Promise<InMemoryDocument | null> {
        const collection = this.getCollection(collectionName);
        const existing = collection.get(id);
        
        if (!existing) {
            return null;
        }

        const updated: InMemoryDocument = {
            ...existing,
            ...update,
            _id: id, // Preserve ID
            createdAt: existing.createdAt, // Preserve creation date
            updatedAt: new Date()
        };

        collection.set(id, updated);
        console.log(`✏️ Updated document in ${collectionName}: ${id}`);
        return updated;
    }

    /**
     * Delete a document by ID
     */
    async deleteById(collectionName: string, id: string): Promise<boolean> {
        const collection = this.getCollection(collectionName);
        const deleted = collection.delete(id);
        if (deleted) {
            console.log(`🗑️ Deleted document from ${collectionName}: ${id}`);
        }
        return deleted;
    }

    /**
     * Count documents in a collection
     */
    async count(collectionName: string, query: Partial<InMemoryDocument> = {}): Promise<number> {
        const results = await this.find(collectionName, query);
        return results.length;
    }

    /**
     * Clear all data (useful for testing)
     */
    async clearAll(): Promise<void> {
        this.collections.clear();
        this.idCounters.clear();
        console.log('🧹 Cleared all in-memory data');
    }

    /**
     * Get collection statistics
     */
    getStats(): { [collectionName: string]: number } {
        const stats: { [collectionName: string]: number } = {};
        for (const [name, collection] of this.collections) {
            stats[name] = collection.size;
        }
        return stats;
    }
}

// Singleton instance for the in-memory store
export const inMemoryDataStore = new InMemoryDataStore();