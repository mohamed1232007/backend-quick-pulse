import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

let connectionPromise;

const connectDB = async () => {
    if (mongoose.connection.readyState === 1) return mongoose.connection;
    if (!connectionPromise) {
        connectionPromise = mongoose.connect(process.env.MONGODB_URI)
            .then(() => {
                console.log("MongoDB Connected");
                return mongoose.connection;
            })
            .catch((error) => {
                connectionPromise = undefined;
                throw error;
            });
    }
    return connectionPromise;
};

export default connectDB;
