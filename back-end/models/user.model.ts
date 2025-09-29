import mongoose, { Schema, Document } from 'mongoose';
import { DataAdapter, createDataAdapter, DataAdapterConfig } from '../services/data-adapter.service';

export interface IUser extends Document {
  _id: string;
  username: string;
  email: string;
  roles: string[];
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IUserCreate {
  username: string;
  email: string;
  roles?: string[];
  isActive?: boolean;
}

export interface IUserUpdate {
  username?: string;
  email?: string;
  roles?: string[];
  isActive?: boolean;
}

const userSchema = new Schema<IUser>({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  roles: [{
    type: String,
    required: true
  }],
  isActive: {
    type: Boolean,
    default: true
  },
}, {
  timestamps: true
});

// Create data adapter using global database configuration
export const UserAdapter = createDataAdapter<IUser>('User', userSchema);

// Legacy support - keep the original mongoose model for backward compatibility when using MongoDB
const User = mongoose.model<IUser>('User', userSchema);

export default User;