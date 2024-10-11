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
        await client.connect();
        const userCollection = client.db('users').collection('userCollection');
        const orderCollection = client.db('orders').collection('ordersCollection');
        const depositCollection = client.db('transactions').collection('depositCollection');

        app.post("/register", async (req, res) => {
            const data = req.body;
            const userEmail = data.email;
            // Check if email is already registered
            const existingUser = await userCollection.findOne({ email: userEmail });
            if (existingUser) {
                return res.status(400).json({ message: 'Email already registered' });
            }
            // validate email format
            if (!validateEmail(userEmail)) {
                return res.status(400).json({ message: 'Invalid email format' });
            }

            // save user to the database
            const result = await userCollection.insertOne(data);
            res.status(201).json(result);
        });

        app.get("/getUsers", async (req, res) => {
            const users = await userCollection.find().toArray();
            res.status(200).json(users);
        });


        app.get("/getUser/:email", async (req, res) => {
            const { email } = req.params;
            const user = await userCollection.findOne({ email: email });
            if (!user) {
                return res.status(404).json({ message: 'User not found' });
            }
            res.status(200).json(user);
        });

        app.post("/order", async (req, res) => {
            const data = req.body;
            console.log("bodyDataFromOrder", data);
            console.log(data.userEmail);

            // Validate email format
            if (!validateEmail(data.userEmail)) {
                return res.status(400).json({ message: 'Invalid email format' });
            }

            // Check if user exists
            const user = await userCollection.findOne({ email: data.userEmail });
            if (!user) {
                return res.status(404).json({ message: 'User not found' });
            }

            // Check if user has sufficient balance
            if (user.balance < data.totalAmount) {
                return res.status(400).json({ message: 'Insufficient balance' });
            }

            // Deduct balance from user
            const updatedBalance = user.balance - data.totalAmount;
            await userCollection.updateOne(
                { email: data.userEmail },
                { $set: { balance: updatedBalance } }
            );

            // Save the order to the database
            const result = await orderCollection.insertOne(data);

            res.status(201).json({
                message: 'Order placed successfully',
                orderId: result.insertedId,
                updatedBalance: updatedBalance
            });
        });

        app.get("/getOrders", async (req, res) => {
            const orders = (await orderCollection.find({ status: "pending" }).toArray()).reverse();
            res.status(200).json(orders);
        });

        // get user's order by email

        app.get("/getUserOrders/:email", async (req, res) => {
            const { email } = req.params;
            const userExist = await userCollection.findOne({ userEmail: email });
            if (!userExist) {
                return res.status(404).json({ message: 'User not found' });
            };
            const orders = await orderCollection.find({ userEmail: email }).toArray();
            res.status(200).json(orders);
        });

        app.get("/getUserAdAccounts/:email", async (req, res) => {
            const email = req.params.email;
            try {
                // Check if the user exists
                const userExist = await userCollection.findOne({ email: email });
                console.log(email)
                if (!userExist) {
                    return res.status(404).json({ message: 'User not found' });
                }

                // Fetch all orders for the user
                const orders = await orderCollection.find({ userEmail: email }).toArray();

                // Extract the adAccounts field from each order
                const adAccounts = orders.map(order => order.adAccounts).flat();

                // If there are no adAccounts, send an empty array
                if (!adAccounts.length) {
                    return res.status(404).json({ message: 'No ad accounts found' });
                }

                // Return the adAccounts
                res.status(200).json(adAccounts);
            } catch (error) {
                res.status(500).json({ message: 'Server error', error });
            }
        });


        app.get("/getOrder/:id", async (req, res) => {
            const { id } = req.params;
            const order = await orderCollection.findOne({ _id: new ObjectId(id) });
            if (!order) {
                return res.status(404).json({ message: 'Order not found' });
            }
            res.status(200).json(order);
        });

        app.post("/deposit/:email", async (req, res) => {
            const email = req.params.email;
            try {
                const data = req.body;
                console.log(data)
                // Validate required fields
                const requiredFields = ['userEmail', 'amount', 'transactionId', 'imgLink', 'paymentMethod'];
                for (const field of requiredFields) {
                    if (!data[field]) {
                        return res.status(400).json({ message: `${field} is required` });
                    }
                }

                // Validate email format
                if (!validateEmail(data.userEmail)) {
                    return res.status(400).json({ message: 'Invalid email format' });
                }

                // Check if user email exists
                const userExist = await userCollection.findOne({ userEmail: data.email });
                console.log(userExist)
                if (!userExist) {
                    return res.status(404).json({ message: 'User not found' });
                }

                // Convert amount to number and validate
                const amount = parseFloat(data.amount);
                if (isNaN(amount) || amount < 0) {
                    return res.status(400).json({ message: 'Invalid amount format' });
                }

                // Save the deposit to the database
                const depositResult = await depositCollection.insertOne({
                    userEmail: data.userEmail,
                    amount,
                    transactionId: data.transactionId,
                    imgLink: data.imgLink,
                    paymentMethod: data.paymentMethod,
                    timestamp: new Date(),
                    status: 'pending', // Set initial status to pending
                });

                // Send response with deposit result
                res.status(201).json({ message: 'Deposit created successfully', depositId: depositResult.insertedId });
            } catch (error) {
                console.error('Error processing deposit:', error);
                res.status(500).json({ message: 'An error occurred while processing the deposit.' });
            }
        });

        // get all deposits by user email
        app.get("/getDeposits/:email", async (req, res) => {
            const { email } = req.params;
            try {
                // Check if the user exists
                const userExist = await userCollection.findOne({ email: email });
                if (!userExist) {
                    return res.status(404).json({ message: 'User not found' });
                }
                // Fetch all deposits for the user
                const deposits = (await depositCollection.find({ userEmail: email }).toArray()).reverse();
                // Return the deposits
                res.status(200).json(deposits);
            } catch (error) {
                console.error('Error fetching deposits:', error);
                res.status(500).json({ message: 'An error occurred while fetching deposits.' });
            }
            // Update deposit status to 'processed' if amount is greater than 0
            // await depositCollection.updateMany({ userEmail: email, amount: { $gt: 0 } }, { $set: { status: 'processed' } });
        });

        // get all pending deposits

        app.get("/getPendingDeposits", async (req, res) => {
            const pendingDeposits = await depositCollection.find({ status: 'pending' }).toArray();
            res.status(200).json(pendingDeposits);
        });

        // update deposit status to 'approved'

        app.put("/approveDeposit/:id", async (req, res) => {
            const { id } = req.params;
            const { status } = req.body;

            // Check if the transaction exists
            const depositData = await depositCollection.findOne({ _id: new ObjectId(id) });
            if (!depositData) {
                console.log("Deposit not found");
                return res.status(404).json({ message: 'Deposit not found' });
            }

            // Update deposit status
            const deposit = await depositCollection.findOneAndUpdate(
                { _id: new ObjectId(id) },
                { $set: { status: status } },
                { returnDocument: 'after' } // Return the updated document
            );
            console.log("Deposit updated:", deposit);

            // Find user by email stored in this transaction
            const userExist = await userCollection.findOne({ email: depositData.userEmail });
            console.log("User found:", userExist);
            if (!userExist) {
                return res.status(404).json({ message: 'User not found' });
            }

            // Only update user's balance if the status is 'approved'
            if (status === 'approved') {
                const updatedBalance = await userCollection.updateOne(
                    { email: depositData.userEmail },
                    { $inc: { balance: depositData.amount } } // Increment balance by deposit amount
                );

                if (updatedBalance.matchedCount === 0) {
                    return res.status(404).json({ message: 'User not found for balance update' });
                }

                // Respond with the deposit and updated balance
                return res.status(200).json({
                    message: 'Deposit approved and balance updated',
                    deposit: deposit.value,
                    userBalance: userExist.balance + depositData.amount
                });
            }

            // If status is not approved, respond without updating the balance
            res.status(200).json({
                message: `Deposit status updated to '${status}', but no balance change`,
                deposit: deposit.value
            });
        });




        // get all pending orders


        app.put("/updateAdAccountBmId/:id", async (req, res) => {
            const { id } = req.params; // Extract the ad account ID from the request parameters
            const { bmId } = req.body; // Extract bmId from the request body
            const { status } = req.body;

            // Validate bmId
            if (!bmId) {
                return res.status(400).json({ message: 'BM ID is required' });
            }

            try {
                // Update the bmId and status of the ad account using the positional operator
                const updatedAdAccount = await orderCollection.updateOne(
                    { "adAccounts.id": id }, // Match the document containing the ad account
                    {
                        $set: {
                            "adAccounts.$.bmId": bmId, // Update the bmId field
                            "adAccounts.$.status": "Paused" // Update the status field to "Paused"
                        }
                    }
                );

                // Check if the document was updated
                if (updatedAdAccount.matchedCount === 0) {
                    return res.status(404).json({ message: 'Ad account not found' });
                }

                // Optionally, retrieve the updated document to return it
                const updatedDocument = await orderCollection.findOne({ "adAccounts.id": id });

                // Return the updated ad account
                res.status(200).json(updatedDocument.adAccounts.find(account => account.id === id));
            } catch (error) {
                console.error('Error updating ad account:', error);
                res.status(500).json({ message: 'Internal server error' });
            }
        });


        app.get("/getBMShares", async (req, res) => {
            try {
                const bmShares = await orderCollection.aggregate([
                    { $unwind: "$adAccounts" },
                    {
                        $match: {
                            "adAccounts.bmId": { $exists: true, $ne: null },
                            "adAccounts.status": "Pending"
                        }
                    },
                    {
                        $project: {
                            id: "$adAccounts.id",
                            accountName: "$adAccounts.name",
                            email: "$userEmail",
                            bmId: "$adAccounts.bmId",
                            status: "$adAccounts.status"
                        }
                    }
                ]).toArray();

                res.status(200).json(bmShares);
            } catch (error) {
                console.error("Error fetching BM shares:", error);
                res.status(500).json({ message: "Internal server error" });
            }
        });

        // API to update BM Share status
        app.put("/updateBMShareStatus/:id", async (req, res) => {
            const { id } = req.params;
            const { status } = req.body;

            try {
                const result = await orderCollection.updateOne(
                    { "adAccounts.id": id },
                    { $set: { "adAccounts.$.status": status } }
                );

                if (result.modifiedCount === 0) {
                    return res.status(404).json({ message: "BM share not found or status not updated" });
                }

                res.status(200).json({ message: "BM share status updated successfully" });
            } catch (error) {
                console.error("Error updating BM share status:", error);
                res.status(500).json({ message: "Internal server error" });
            }
        });




        app.get("/getAdAccountById/:id", async (req, res) => {
            const { id } = req.params; // Extract the ad account ID from the request parameters

            try {
                // Find the document that contains the ad account with the specified ID
                const document = await orderCollection.findOne(
                    { "adAccounts.id": id }, // Match the document containing the ad account
                    { projection: { adAccounts: { $elemMatch: { id } } } } // Return only the specific ad account
                );

                // Check if the document is found
                if (!document || document.adAccounts.length === 0) {
                    return res.status(404).json({ message: 'Ad account not found' });
                }

                // Return the specific ad account found in the document
                res.status(200).json(document.adAccounts[0]);
            } catch (error) {
                console.error('Error retrieving ad account:', error);
                res.status(500).json({ message: 'Internal server error' });
            }
        });

        app.get("/getUserAdAccounts/:email", async (req, res) => {
            const { email } = req.params;
            console.log(email)
            try {
                const result = await orderCollection.findOne({ userEmail: email });

                if (!result) {
                    return res.status(404).json({ message: "No ad accounts found for this user" });
                }

                const adAccounts = result.adAccounts.map(account => ({
                    id: account.id,
                    name: account.name,
                    adAccountType: account.adAccountType,
                    status: account.status,
                    timezone: account.timezone,
                    deposit: account.deposit,
                    bmId: account.bmId || null
                }));

                res.status(200).json(adAccounts);
            } catch (error) {
                console.error("Error fetching user ad accounts:", error);
                res.status(500).json({ message: "Internal server error" });
            }
        });

        app.put("/updateOrderStatus/:id", async (req, res) => {
            const { id } = req.params;
            const { status } = req.body;

            try {
                const result = await orderCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: { status: status } }
                );
                console.log(result)

                if (result.modifiedCount === 0) {
                    return res.status(404).json({ message: 'Order not found or status not updated' });
                }

                res.status(200).json({ message: 'Order status updated successfully' });
            } catch (error) {
                console.error('Error updating order status:', error);
                res.status(500).json({ message: 'Internal server error' });
            }
        });

        app.put("/updateAdAccountStatus/:orderId/:accountId", async (req, res) => {
            const { orderId, accountId } = req.params;
            const { status } = req.body;

            try {
                const result = await orderCollection.updateOne(
                    {
                        _id: new ObjectId(orderId),
                        "adAccounts.id": accountId
                    },
                    { $set: { "adAccounts.$.status": status } }
                );

                if (result.modifiedCount === 0) {
                    return res.status(404).json({ message: 'Order or ad account not found, or status not updated' });
                }

                res.status(200).json({ message: 'Ad account status updated successfully' });
            } catch (error) {
                console.error('Error updating ad account status:', error);
                res.status(500).json({ message: 'Internal server error' });
            }
        });




        // Function to validate email format
        function validateEmail(email) {
            // Implement email validation logic here (e.g., regex)
            return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
        }
    }

    finally {
        // jnjsf
        // console.log('here is finally')
        // DB_PASS = VZCR4IbfLQ12G3AJ
        // DB_USER = ads_agency
    }
};




run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('App is running on secure server? The answer is Yeah!')
});


app.listen(port, () => {
    console.log(`App is running on port ${port}`)
});