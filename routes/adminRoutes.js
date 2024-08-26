const express = require("express");
const Stripe = require("stripe");
const Order = require("../models/order");
require("dotenv").config();

const stripe = Stripe(process.env.STRIPE_KEY);
const router = express.Router();

/**  INFO: in memory cache for sessions */

let sessionsCache = {
  ordersCount: 0,
  sessions: {},
};

router.get("/all-orders", async (_req, res) => {
  try {
    const orders = await Order.find();
    const currentOrdersCount = orders.length;
    if (currentOrdersCount > sessionsCache.ordersCount) {
      sessionsCache.ordersCount = currentOrdersCount;
      for (const order of orders) {
        if (!sessionsCache.sessions[order.sessionId]) {
          try {
            const session = await stripe.checkout.sessions.retrieve(
              order.sessionId,
            );
            order.shipping = session;
            await order.save();

            sessionsCache.sessions[order.sessionId] = session;
          } catch (error) {
            console.error("Error retrieving session:", error.message);
          }
        } else {
          order.shipping = sessionsCache.sessions[order.sessionId];
        }
      }
    } else {
      for (const order of orders) {
        if (sessionsCache.sessions[order.sessionId]) {
          order.shipping = sessionsCache.sessions[order.sessionId];
        }
      }
    }

    res.json(orders);
  } catch (error) {
    console.error(error.message);
    res.status(500).send("Server error");
  }
});
router.get("/retrieve-order", async (req, res) => {
  try {
    const orderId = req.query.orderId;
    const session = await stripe.checkout.sessions.retrieve(orderId);
    res.json(session);
  } catch (error) {
    console.error("Error retrieving order:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});
router.get("/orderInfo", async (_req, res) => {
  try {
    const orders = await Order.find();
    let totalAmount = 0;
    let totalItemCount = 0;
    let paidCount = 0;
    let unpaidCount = 0;

    orders.forEach((order) => {
      const amountTotal = order.shipping?.amount_total || 0;
      totalAmount += amountTotal;

      if (Array.isArray(order.lineItems)) {
        order.lineItems.forEach((item) => {
          totalItemCount += parseInt(item.quantity, 10);
        });
      }

      const paymentStatus = order.shipping?.payment_status;
      if (paymentStatus === "paid") {
        paidCount++;
      } else if (paymentStatus === "unpaid") {
        unpaidCount++;
      }
    });

    const response = {
      totalAmount,
      totalItemCount,
      paymentStatusCounts: {
        paid: paidCount,
        unpaid: unpaidCount,
      },
    };

    res.json(response);
  } catch (error) {
    console.error(error.message);
    res.status(500).send("Server error");
  }
});
/**
 * @classdesc [INFO: Update Status of Order]
 */
router.post("/update-status", async (req, res) => {
  try {
    const { orderId, deliveryStatus } = req.body;
    const order = await Order.findByIdAndUpdate(
      orderId,
      { delivery_status: deliveryStatus },
      { new: true },
    );
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    res.json(order);
  } catch (error) {
    console.error("Error updating delivery status:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/order-noti", async (_req, res) => {
  try {
    const allOrders = await Order.find();
    res.status(200).json(allOrders.length);
  } catch (error) {
    console.error("Error retrieving prompts:", error);
    res
      .status(500)
      .json({ message: "Error retrieving prompts from the database" });
  }
});

module.exports = router;
