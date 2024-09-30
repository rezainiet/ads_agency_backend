const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const express = require('express');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 4000;
const nodemailer = require('nodemailer');
const bodyParser = require('body-parser');



app.use(express.json());
app.use(cors());
require('dotenv').config();
app.use(bodyParser.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.jq9ky.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        client.connect();
        const userCollection = client.db('userCollection').collection('users');
        const orderCollection = client.db('ordersCollection').collection('orders');

        app.post("/register", async (req, res) => {
            const { email, password, firstName, lastName } = req.body;
            // Check if email is already registered
            const existingUser = await userCollection.findOne({ email });
            if (existingUser) {
                return res.status(400).json({ message: 'Email already registered' });
            }
            // validate email format
            if (!validateEmail(email)) {
                return res.status(400).json({ message: 'Invalid email format' });
            }

            // save user to the database
            const result = await userCollection.insertOne({
                email,
                password,
                firstName,
                lastName,
            });
            res.status(201).json(result);
        });

        app.get("/getUsers", async (req, res) => {
            const users = await userCollection.find().toArray();
            res.status(200).json(users);
        });


        app.get("/getUser/:id", async (req, res) => {
            const { id } = req.params;
            const user = await userCollection.findOne({ _id: new ObjectId(id) });
            if (!user) {
                return res.status(404).json({ message: 'User not found' });
            }
            res.status(200).json(user);
        });

        app.post("/order", async (req, res) => {
            const data = req.body;

            // Validate email format
            if (!validateEmail(data.userEmail)) {
                return res.status(400).json({ message: 'Invalid ad manager email format' });
            }
            // checkUser email exists or not
            const userExist = await userCollection.findOne({ email: data.userEmail });
            if (!userExist) {
                return res.status(404).json({ message: 'User not found' });
            };

            // save the order to the database
            const result = await orderCollection.insertOne(data);
            res.status(201).json(result);

        });

        app.get("/getOrders", async (req, res) => {
            const orders = await orderCollection.find().toArray();
            res.status(200).json(orders);
        });

        app.get("/getOrder/:id", async (req, res) => {
            const { id } = req.params;
            const order = await orderCollection.findOne({ _id: new ObjectId(id) });
            if (!order) {
                return res.status(404).json({ message: 'Order not found' });
            }
            res.status(200).json(order);
        })

        // Function to validate email format
        function validateEmail(email) {
            // Implement email validation logic here (e.g., regex)
            return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
        }
    }

    finally {
        // jnjsf
        // console.log('here is finally')
    }
};




run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('App is running on secure server? The answer is Yeah!')
});


app.listen(port, () => {
    console.log(`App is running on port ${port}`)
});