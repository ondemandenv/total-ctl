/**
 * Data adapter service that provides a unified interface for both MongoDB and in-memory storage
 * Automatically switches between storage backends based on environment
 */

import mongoose, { Document, Model, Schema } from 'mongoose';
import { inMemoryDataStore, InMemoryDocument, QueryOptions } from './in-memory-data.service';
import { DatabaseConfigService } from './database-config.service';

export interface DataAdapterConfig {
    useInMemory: boolean;
    mongoConnectionString?: string;
}

export class DataAdapter<T extends Document> {
    private collectionName: string;
    private mongoModel?: Model<T>;
    private useInMemory: boolean;

    constructor(
        collectionName: string, 
        schema: Schema<T>, 
        config: DataAdapterConfig
    ) {
        this.collectionName = collectionName;
        this.useInMemory = config.useInMemory;

        if (!this.useInMemory && config.mongoConnectionString) {
            // Only create mongoose model if we're using MongoDB
            this.mongoModel = mongoose.model<T>(collectionName, schema);
        }

        console.log(`📊 DataAdapter for ${collectionName} initialized (${this.useInMemory ? 'in-memory' : 'MongoDB'})`);
    }

    /**
     * Create a new document
     */
    async create(data: any): Promise<T | InMemoryDocument> {
        if (this.useInMemory) {
            return await inMemoryDataStore.create(this.collectionName, data);
        } else {
            if (!this.mongoModel) {
                throw new Error('MongoDB model not initialized');
            }
            const doc = new this.mongoModel(data);
            return await doc.save();
        }
    }

    /**
     * Find documents
     */
    async find(query: any = {}, options: any = {}): Promise<(T | InMemoryDocument)[]> {
        if (this.useInMemory) {
            const inMemOptions: QueryOptions = {
                limit: options.limit,
                skip: options.skip,
                sort: options.sort
            };
            return await inMemoryDataStore.find(this.collectionName, query, inMemOptions);
        } else {
            if (!this.mongoModel) {
                throw new Error('MongoDB model not initialized');
            }
            let mongoQuery = this.mongoModel.find(query);
            
            if (options.limit) mongoQuery = mongoQuery.limit(options.limit);
            if (options.skip) mongoQuery = mongoQuery.skip(options.skip);
            if (options.sort) mongoQuery = mongoQuery.sort(options.sort);
            
            return await mongoQuery.exec();
        }
    }

    /**
     * Find one document
     */
    async findOne(query: any): Promise<T | InMemoryDocument | null> {
        if (this.useInMemory) {
            return await inMemoryDataStore.findOne(this.collectionName, query);
        } else {
            if (!this.mongoModel) {
                throw new Error('MongoDB model not initialized');
            }
            return await this.mongoModel.findOne(query).exec();
        }
    }

    /**
     * Find by ID
     */
    async findById(id: string): Promise<T | InMemoryDocument | null> {
        if (this.useInMemory) {
            return await inMemoryDataStore.findById(this.collectionName, id);
        } else {
            if (!this.mongoModel) {
                throw new Error('MongoDB model not initialized');
            }
            return await this.mongoModel.findById(id).exec();
        }
    }

    /**
     * Update by ID
     */
    async findByIdAndUpdate(id: string, update: any, options: any = {}): Promise<T | InMemoryDocument | null> {
        if (this.useInMemory) {
            return await inMemoryDataStore.updateById(this.collectionName, id, update);
        } else {
            if (!this.mongoModel) {
                throw new Error('MongoDB model not initialized');
            }
            return await this.mongoModel.findByIdAndUpdate(id, update, { new: true, ...options }).exec() as T;
        }
    }

    /**
     * Delete by ID
     */
    async findByIdAndDelete(id: string): Promise<T | InMemoryDocument | null> {
        if (this.useInMemory) {
            const doc = await inMemoryDataStore.findById(this.collectionName, id);
            if (doc) {
                await inMemoryDataStore.deleteById(this.collectionName, id);
                return doc;
            }
            return null;
        } else {
            if (!this.mongoModel) {
                throw new Error('MongoDB model not initialized');
            }
            return await this.mongoModel.findByIdAndDelete(id).exec();
        }
    }

    /**
     * Count documents
     */
    async countDocuments(query: any = {}): Promise<number> {
        if (this.useInMemory) {
            return await inMemoryDataStore.count(this.collectionName, query);
        } else {
            if (!this.mongoModel) {
                throw new Error('MongoDB model not initialized');
            }
            return await this.mongoModel.countDocuments(query).exec();
        }
    }

    /**
     * Check if using in-memory storage
     */
    isUsingInMemory(): boolean {
        return this.useInMemory;
    }
}

/**
 * Factory function to create data adapters using global database configuration
 */
export function createDataAdapter<T extends Document>(
    collectionName: string,
    schema: Schema<T>,
    config?: DataAdapterConfig
): DataAdapter<T> {
    if (config) {
        return new DataAdapter(collectionName, schema, config);
    }

    // Use global database configuration service
    const dbConfig = DatabaseConfigService.getInstance();
    const adapterConfig: DataAdapterConfig = {
        useInMemory: dbConfig.isUsingInMemory(),
        mongoConnectionString: dbConfig.getConnectionString()
    };

    return new DataAdapter(collectionName, schema, adapterConfig);
}