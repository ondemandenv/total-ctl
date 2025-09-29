/**
 * Sandbox service demonstrating how to use the new data adapters
 * This service can work with both MongoDB and in-memory storage transparently
 */

import { UserAdapter } from '../models/user.model';
import { HologramAdapter } from '../models/hologram.model';
import { IUserCreate, IUserUpdate } from '../models/user.model';
import { IHologramCreate } from '../models/hologram.model';

export class SandboxDataService {
    
    /**
     * Create a new user
     */
    async createUser(userData: IUserCreate) {
        try {
            console.log(`📝 Creating user: ${userData.username} (${UserAdapter.isUsingInMemory() ? 'in-memory' : 'MongoDB'})`);
            
            const user = await UserAdapter.create({
                ...userData,
                roles: userData.roles || ['user'],
                isActive: userData.isActive !== undefined ? userData.isActive : true
            });

            console.log(`✅ User created successfully: ${user._id}`);
            return user;
        } catch (error) {
            console.error(`❌ Failed to create user:`, error);
            throw error;
        }
    }

    /**
     * Get all users with optional filtering
     */
    async getUsers(options: { 
        isActive?: boolean; 
        limit?: number; 
        skip?: number; 
    } = {}) {
        try {
            const query: any = {};
            if (options.isActive !== undefined) {
                query.isActive = options.isActive;
            }

            const users = await UserAdapter.find(query, {
                limit: options.limit,
                skip: options.skip,
                sort: { createdAt: -1 }
            });

            console.log(`🔍 Found ${users.length} users`);
            return users;
        } catch (error) {
            console.error(`❌ Failed to get users:`, error);
            throw error;
        }
    }

    /**
     * Get user by ID
     */
    async getUserById(userId: string) {
        try {
            const user = await UserAdapter.findById(userId);
            
            if (!user) {
                console.log(`⚠️ User not found: ${userId}`);
                return null;
            }

            console.log(`✅ Found user: ${user.username}`);
            return user;
        } catch (error) {
            console.error(`❌ Failed to get user by ID:`, error);
            throw error;
        }
    }

    /**
     * Update user
     */
    async updateUser(userId: string, updateData: IUserUpdate) {
        try {
            const user = await UserAdapter.findByIdAndUpdate(userId, updateData);
            
            if (!user) {
                console.log(`⚠️ User not found for update: ${userId}`);
                return null;
            }

            console.log(`✅ User updated successfully: ${userId}`);
            return user;
        } catch (error) {
            console.error(`❌ Failed to update user:`, error);
            throw error;
        }
    }

    /**
     * Delete user
     */
    async deleteUser(userId: string) {
        try {
            const user = await UserAdapter.findByIdAndDelete(userId);
            
            if (!user) {
                console.log(`⚠️ User not found for deletion: ${userId}`);
                return false;
            }

            console.log(`✅ User deleted successfully: ${userId}`);
            return true;
        } catch (error) {
            console.error(`❌ Failed to delete user:`, error);
            throw error;
        }
    }

    /**
     * Create a hologram
     */
    async createHologram(hologramData: IHologramCreate) {
        try {
            console.log(`📝 Creating hologram: ${hologramData.name} for user ${hologramData.userId}`);
            
            const hologram = await HologramAdapter.create({
                ...hologramData,
                isActive: true,
                metadata: hologramData.metadata || {}
            });

            console.log(`✅ Hologram created successfully: ${hologram._id}`);
            return hologram;
        } catch (error) {
            console.error(`❌ Failed to create hologram:`, error);
            throw error;
        }
    }

    /**
     * Get holograms for a user
     */
    async getHologramsByUser(userId: string) {
        try {
            const holograms = await HologramAdapter.find(
                { userId, isActive: true },
                { sort: { createdAt: -1 } }
            );

            console.log(`🔍 Found ${holograms.length} holograms for user ${userId}`);
            return holograms;
        } catch (error) {
            console.error(`❌ Failed to get holograms:`, error);
            throw error;
        }
    }

    /**
     * Get storage statistics
     */
    async getStorageStats() {
        try {
            const userCount = await UserAdapter.countDocuments();
            const hologramCount = await HologramAdapter.countDocuments();
            
            const stats = {
                storageType: UserAdapter.isUsingInMemory() ? 'in-memory' : 'MongoDB',
                users: userCount,
                holograms: hologramCount,
                timestamp: new Date().toISOString()
            };

            console.log(`📊 Storage stats:`, stats);
            return stats;
        } catch (error) {
            console.error(`❌ Failed to get storage stats:`, error);
            throw error;
        }
    }

    /**
     * Seed sample data for testing
     */
    async seedSampleData() {
        try {
            console.log(`🌱 Seeding sample data...`);
            
            // Create some sample users
            const users = await Promise.all([
                this.createUser({
                    username: 'testuser1',
                    email: 'user1@example.com',
                    roles: ['user', 'moderator']
                }),
                this.createUser({
                    username: 'testuser2',
                    email: 'user2@example.com',
                    roles: ['user']
                })
            ]);

            // Create some sample holograms
            const holograms = await Promise.all([
                this.createHologram({
                    name: 'Sample Hologram 1',
                    url: 'https://example.com/hologram1.mp4',
                    thumbnailUrl: 'https://example.com/thumb1.jpg',
                    userId: users[0]._id,
                    metadata: { duration: 30, quality: 'HD' }
                }),
                this.createHologram({
                    name: 'Sample Hologram 2',
                    url: 'https://example.com/hologram2.mp4',
                    userId: users[1]._id,
                    metadata: { duration: 45, quality: '4K' }
                })
            ]);

            console.log(`✅ Sample data seeded: ${users.length} users, ${holograms.length} holograms`);
            return { users, holograms };
        } catch (error) {
            console.error(`❌ Failed to seed sample data:`, error);
            throw error;
        }
    }
}