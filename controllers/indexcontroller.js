const Category = require("../models/category");
const Product = require("../models/product");
const Plan = require("../models/plans");
const User = require("../models/user");
const jwt = require("jsonwebtoken");
const {
  getCart,
  addToCart,
  deleteItemFromCart,
} = require("../middlewares/cache");

const mongoose = require("mongoose");

const { server } = require("../config");
const fs = require("fs");
const tryCatch = require("../utilities/catchasync");
const PlanPaymentService = require("../services/planPayment");
const PlanPaymentInstance = new PlanPaymentService();

const PaymentService = require("../services/payment");
const paymentInstance = new PaymentService();
const { validationResult } = require("express-validator");
const Order = require("../models/order");
const ApiFeatures = require("../utilities/api-features");
const Mailgen = require("mailgen");
const nodemailer = require("nodemailer");
exports.getCategoriesByType = (req, res, next) => {
  const { type } = req.params;
  Category.find({ categoryType: type })
    .then((categories) => {
      return res.status(200).json({
        success: true,
        code: 200,
        status: "success",
        data: { categories, msg: "Single Category fetched successfully" },
      });
    })
    .catch((error) => {
      next(error);
    });
};

exports.getProductById = async (req, res, next) => {
  const { selectedSubcategory } = req.query;
  try {
    const { _id } = await Category.findOne({
      sub_category: selectedSubcategory,
    });

    const products = await Product.find({ categoryId: _id });
    if (products.length == 0) {
      return res.status(200).json({
        success: true,
        code: 200,
        status: "success",
        msg: "no product found",
      });
    }
    return res.status(200).json({
      success: true,
      code: 200,
      status: "success",
      data: { products, msg: "Products fetched successfully" },
    });
  } catch (error) {
    next(error);
  }
};

exports.fetchAllProducts = (req, res, next) => {
  Product.find({ productType: "product" })
    .populate("categoryId")
    .populate("userId")
    .sort("-createdAt")
    .then((products) => {
      return res.status(200).json({
        success: true,
        code: 200,
        status: "success",
        data: { products, msg: "Products fetched successfully" },
      });
    })
    .catch((error) => {
      next(error);
    });
};
exports.fetchAllServices = (req, res, next) => {
  Product.find({ productType: "service" })
    .populate("categoryId")
    .populate("userId")
    .sort("-createdAt")
    .then((services) => {
      return res.status(200).json({
        success: true,
        code: 200,
        status: "success",
        data: { services, msg: "Services fetched successfully" },
      });
    })
    .catch((error) => {
      next(error);
    });
};
exports.fetchSingleProduct = (req, res, next) => {
  const { id } = req.params;
  Product.findOne({ productType: "product", _id: id })
    .populate("categoryId")
    .populate("userId")
    .then((product) => {
      if (!product) {
        return res.status(400).json({
          success: false,
          code: 400,
          status: "error",
          data: {
            path: "id",
            msg: `No product found with id=${id} please verify id`,
            value: id,
            location: "params",
            type: "route parameter",
          },
        });
      }
      return res.status(200).json({
        success: true,
        code: 200,
        status: "success",
        data: { product, msg: "Product fetched successfully" },
      });
    })
    .catch((error) => {
      next(error);
    });
};
exports.fetchSingleService = (req, res, next) => {
  const { id } = req.params;
  Product.findOne({ productType: "service", _id: id })
    .populate("categoryId")
    .populate("userId")
    .then((service) => {
      if (!service) {
        return res.status(400).json({
          success: false,
          code: 400,
          status: "error",
          data: {
            path: "id",
            msg: `No Service found with id=${id} please verify id.`,
            value: id,
            location: "params",
            type: "route parameter",
          },
        });
      }
      return res.status(200).json({
        success: true,
        code: 200,
        status: "success",
        data: { service, msg: "Service fetched successfully" },
      });
    })
    .catch((error) => {
      next(error);
    });
};
exports.createNewProduct = async (req, res, next) => {
  try {
    const body = req.body;
    const { category_name, sub_category } = body;
    const categoryId = await Category.findOne({
      category_name,
      sub_category,
    });
    const product = await Product.create({
      productName: body.productName,
      categoryId,
      productType: body.productType,
      header: body.header,
      link: {
        text: body.linkText,
        url: body.linkUrl,
      },
      description: body.description,
      images: body.images,
      additionalDetails: {
        gender: body.gender,
        seller: body.seller,
        quantity: body.quantity,
        address: body.address,
        services: body.services,
      },
      prices: {
        actualPrice: body.prices.actualPrice,
        discount: body.prices.discount,
        shippingFee: body.prices.shippingFee,
      },
      userId: req.user._id,
      createdAt: new Date(),
      updatedAt: new Date(),
      deliveryPreference: {
        handleDelivery: body.delivery.handledByVendor,
        deliveryService: body.delivery.deliveryService,
      },
    });
    return res.status(200).json({
      success: true,
      code: 200,
      status: "success",
      data: { product, msg: "Single product inserted successfully" },
    });
  } catch (error) {
    next(error);
  }
};

exports.getMerchantProducts = async (req, res, next) => {
  const userId = req.user._id;
  try {
    const merchantProducts = await Product.find({ userId });
    if (!merchantProducts) {
      res.status(404).json({ status: true, msg: "no product found" });
      return;
    }
    res.status(200).json({
      number: merchantProducts.length,
      status: true,
      products: merchantProducts,
    });
  } catch (error) {
    next(error);
  }
};

exports.getOrdersByVendor = async (req, res) => {
  const vendorId = req.user._id;

  try {
    const orders = await Order.aggregate([
      {
        $unwind: "$items",
      },
      {
        $match: {
          "items.vendorid": new mongoose.Types.ObjectId(vendorId),
        },
      },
      {
        $lookup: {
          from: "products",
          localField: "items.product",
          foreignField: "_id",
          as: "productDetails",
        },
      },
      {
        $unwind: "$productDetails",
      },
      {
        $group: {
          _id: "$_id",
          orderNo: { $first: "$orderNo" },
          items: {
            $push: {
              quantity: "$items.quantity",
              commission: "$items.commission",
              total: "$items.total",
              product: {
                _id: "$productDetails._id",
                productName: "$productDetails.productName",
                images: "$productDetails.images",
              },
            },
          },
          userId: { $first: "$userId" },
          total: { $first: "$total" },
          totalCommission: { $first: "$totalCommission" },
          status: { $first: "$status" },
          address: { $first: "$address" },
          createdAt: { $first: "$createdAt" },
          updatedAt: { $first: "$updatedAt" },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "userDetails",
        },
      },
      {
        $unwind: "$userDetails",
      },
      {
        $project: {
          orderNo: 1,
          items: 1,
          total: 1,
          totalCommission: 1,
          status: 1,
          address: 1,
          createdAt: 1,
          updatedAt: 1,
          user: {
            fullname: "$userDetails.fullname",
          },
        },
      },
    ]);

    res.status(200).json(orders);
  } catch (error) {
    console.error("Error fetching orders by vendor:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
exports.fetchRelatedProducts = (req, res, next) => {
  const { id, productType } = req.body;
  Product.find({ productType: productType, categoryId: id })
    .populate("categoryId")
    .populate("userId")
    .then((products) => {
      return res.status(200).json({
        success: true,
        body: {
          status: 200,
          status: "success",
          data: {
            products,
            msg: "Related Products fetched successfully",
          },
        },
      });
    })
    .catch((error) => {
      next(error);
    });
};
exports.deleteProductImage = (req, res, next) => {
  const { prodId, imgId } = req.body;
  Product.findOne({ _id: prodId, userId: req.user._id })
    .then((product) => {
      if (!product) {
        return res.status(400).json({
          success: false,
          code: 400,
          status: "error",
          data: {
            path: "id",
            msg: `No product found with id associated with this user please verify id.`,
            value: prodId,
            location: "params",
            type: "route parameter",
          },
        });
      }
      return product.removeImage(imgId).then((product) => {
        return res.status(200).json({
          success: true,
          code: 200,
          status: "success",
          data: { product, msg: "Product image was successfully removed" },
        });
      });
    })
    .catch((error) => {
      next(error);
    });
};
exports.deleteProduct = (req, res, next) => {
  const { id } = req.params;
  Product.findOneAndDelete({ _id: id, userId: req.user._id })
    .then((product) => {
      if (!product) {
        return res.status(400).json({
          success: false,
          code: 400,
          status: "error",
          data: {
            path: "id",
            msg: `No product found with id associated with this user please verify id.`,
            value: id,
            location: "params",
            type: "route parameter",
          },
        });
      }
      return res.status(200).json({
        success: true,
        code: 200,
        status: "success",
        data: { product, msg: "Product was successfully removed" },
      });
    })
    .catch((error) => {
      next(error);
    });
};
exports.updateProduct = (req, res, next) => {
  const { id } = req.params;
  const body = req.body;
  const imagesArr = [];
  const images = req.files;
  for (let image of images) {
    imagesArr.push({
      url: `${server}` + `${image.destination}${image.filename}`.slice(8),
    });
  }
  Product.findOne({ _id: id, userId: req.user._id })
    .then((product) => {
      if (!product) {
        return res.status(400).json({
          success: false,
          code: 400,
          status: "error",
          data: {
            path: "id",
            msg: `No product found with id associated with this user please verify id.`,
            value: id,
            location: "params",
            type: "route parameter",
          },
        });
      }
      product.productName = body.productName;
      product.header = body.header;
      product.link.text = body.linkText;
      product.link.url = body.linkUrl;
      product.description = body.description;
      product.images = [...product.images, ...imagesArr];
      product.additionalDetails.gender = body.gender;
      product.additionalDetails.quantity = body.quantity;
      product.additionalDetails.address = body.address;
      product.additionalDetails.services = body.services;
      product.prices.actualPrice = body.actualPrice;
      product.prices.discount = body.discount;
      product.updatedAt = new Date(Date.now());
      return product.save().then((updatedProduct) => {
        return res.status(200).json({
          success: true,
          code: 200,
          status: "success",
          data: {
            ...updatedProduct,
            msg: "Product was successfully updated",
          },
        });
      });
    })
    .catch((error) => {
      next(error);
    });
};
exports.searchProduct = (req, res, next) => {
  const { q } = req.query;
  Product.find({ productName: { $regex: new RegExp(q), $options: "i" } })
    .then((products) => {
      return res.status(200).json({
        success: true,
        code: 200,
        status: "success",
        data: { products: [...products], msg: "Products fetched successfully" },
      });
    })
    .catch((error) => {
      next(error);
    });
};

exports.fetchCart = async (req, res) => {
  try {
    const cart = getCart();
    res.status(200).json({
      success: true,
      status: "success",
      code: 200,
      data: cart,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      code: 500,
      status: "error",
      msg: "Failed to fetch cart",
    });
  }
};

// Add to Cart
exports.addTocart = async (req, res) => {
  try {
    const { id } = req.body;
    const product = await Product.findOne({ productType: "product", _id: id });

    if (!product) {
      return res.status(404).json({
        success: false,
        code: 404,
        status: "error",
        msg: "Product not found",
      });
    }
    const cart = getCart();
    const existingItem = cart.find(
      (item) => item.product.id.toString() === id.toString()
    );
    if (existingItem) {
      existingItem.quantity += 1;
      existingItem.total =
        existingItem.quantity *
        (product.prices.actualPrice - product.prices.discount || 0);
      addToCart(existingItem);
    } else {
      const cartItem = {
        id: product._id,
        product: {
          productName: product.productName,
          imageUrl: product.images[0].url,
          vendorid: product.userId,
          id: product._id,
          price: product.prices.actualPrice - product.prices.discount,
        },
        quantity: 1,
        total: product.prices.actualPrice - product.prices.discount,
        shipping: product.prices.shippingFee || 0,
      };
      addToCart(cartItem);
    }
    res.status(200).json({
      success: true,
      code: 200,
      status: "success",
      data: getCart(),
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      success: false,
      code: 500,
      status: "error",
      msg: "Internal server error",
    });
  }
};

// Delete from Cart
exports.deleteFromCart = async (req, res) => {
  try {
    const { id } = req.body;
    const cart = getCart();
    const existingItem = cart.find(
      (item) => item.product.id.toString() === id.toString()
    );

    if (existingItem) {
      existingItem.quantity -= 1;

      if (existingItem.quantity <= 0) {
        deleteItemFromCart(id);
      } else {
        existingItem.total = existingItem.quantity * existingItem.product.price;
        addToCart(existingItem);
      }

      res.status(200).json({
        success: true,
        code: 200,
        status: "success",
        data: getCart(),
      });
    } else {
      res.status(404).json({
        success: false,
        code: 404,
        status: "error",
        msg: "Product not found in cart",
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      code: 500,
      status: "error",
      msg: "Internal server error",
    });
  }
};

exports.getCurrentUserOrder = (req, res, next) => {
  if (req.session["cart"] && req.session["cart"].length > 0) {
    res.status(200).json({
      success: true,
      status: "success",
      code: 200,
      data: { user: req.user, cart: req.session["cart"] },
    });
  } else {
    return res.status(400).json({
      success: false,
      status: "error",
      code: 400,
      data: {
        msg: "Invalid cart details",
        path: "cart",
        value: null,
        location: "session",
      },
    });
  }
};
exports.startPayment = tryCatch(async (req, res, next) => {
  const { id } = req.body;
  const order = await Order.findById(id);
  if (!order) {
    return res.status(400).json({
      success: false,
      code: 400,
      status: "error",
      data: {
        msg: "No order found!",
        value: id,
        path: "id",
        location: "body",
      },
    });
  }

  const paymentdata = {
    email: req.user.email,
    full_name: req.user.fullname || `User-${req.user._id}`,
    amount: order.total,
    orderId: id,
  };
  const response = await paymentInstance.startPayment(paymentdata);
  res.status(201).json({
    success: true,
    status: "Payment Started",
    status: 201,
    data: { response },
  });
});

exports.startPlanPayment = tryCatch(async (req, res, next) => {
  const { id } = req.body;
  const plan = await Plan.findById(id);
  if (!plan) {
    return res.status(400).json({
      success: false,
      code: 400,
      status: "error",
      data: {
        msg: "No order found!",
        value: id,
        path: "id",
        location: "body",
      },
    });
  }

  const paymentdata = {
    email: req.user.email,
    full_name: req.user.fullname || `User-${req.user._id}`,
    amount: plan.amount,
    planId: id,
  };
  const response = await PlanPaymentInstance.startPayment(paymentdata);
  res.status(201).json({
    success: true,
    status: "Payment Started",
    status: 201,
    data: { response },
  });
});

exports.createPayment = tryCatch(async (req, res, next) => {
  const response = await paymentInstance.createPayment(req.query);
  const newStatus = response.status === "success" ? "completed" : "pending";
  const order = await Order.findOne({ _id: response.orderId }).populate(
    "items.product"
  );

  order.status = newStatus;
  const newOrder = await order.save();
  await sendLoginNotification(req.user, order);
  await sendPaymentNotification(order);
  res.status(201).json({
    success: true,
    status: "Payment Created",
    status: 201,
    data: { payment: response, order: newOrder },
  });
});

exports.createPlanPayment = tryCatch(async (req, res, next) => {
  const response = await PlanPaymentInstance.createPayment(req.query);
  const newStatus = response.status === "success" ? "completed" : "pending";
  const plan = await Plan.findOne({ _id: response.planId });
  plan.status = newStatus;
  const newPlan = await plan.save();

  res.status(201).json({
    success: true,
    status: "Payment Created",
    status: 201,
    data: { payment: response, plan: newPlan },
  });
});

const sendLoginNotification = async (user, order) => {
  let MailGenerator = new Mailgen({
    theme: "salted",
    product: {
      name: "Urban trove",
      link: "https://mailgen.js/",
      copyright: "Copyright © 2024 Urban trove. All rights reserved.",
      logo: "https://firebasestorage.googleapis.com/v0/b/newfoodapp-6f76d.appspot.com/o/logo.png?alt=media&token=91fc5015-ef7d-45a5-92cf-2950c3f61fdf",
      logoHeight: "30px",
    },
  });
  let response = {
    body: {
      name: user.fullname,
      intro: [
        "Thank you for shopping on Urban Trove!",
        `Your order ${order.orderNo} has been confirmed successfully.`,
        "It will be packed and shipped as soon as possible. You will receive a notification from us once the item(s) are ready for delivery.",
        "your order has been placed. Tracking of this order is unavailable as we are not responsible for delivery. Once order has been received you are required to click on the 'delivered' button in your profile"
      ],
      table: [
        {
          title: `Order: ${order.orderNo}`,
          data: [
            ...order.items.map((item) => ({
              item: item.product.productName,
              price: `₦${Number(
                item.product.prices.actualPrice
              ).toLocaleString()}`,
            })),
            {
              item: "Total",
              price: `₦${Number(order.total).toLocaleString()}`,
            },
          ],
          columns: {
            customWidth: {
              item: "60%",
              price: "40%",
            },
            customAlignment: {
              price: "right",
            },
          },
        },
      ],

      outro:
        "Need help, or have questions? Just reply to this email, we'd love to help.",
      signature: "Warm Regards",
    },
  };

  let mail = MailGenerator.generate(response);
  let message = {
    from: process.env.EMAIL,
    to: user.email,
    subject: `Your Urban Trove Order ${order.orderNo} has been Confirmed.`,
    html: mail,
  };

  const transporter = nodemailer.createTransport({
    host: "server2.lytehosting.com",
    port: 465,
    secure: true, // Use true since the port is 465
    auth: {
      user: process.env.EMAIL,
      pass: process.env.PASSWORD,
    },
    tls: {
      rejectUnauthorized: false,
    },
  });

  try {
    await transporter.sendMail(message);
  } catch (err) {
    console.error("Error sending email:", err);
  }
};

const sendPaymentNotification = async (order) => {
  let MailGenerator = new Mailgen({
    theme: "salted",
    product: {
      name: "Urban Trove",
      link: "https://mailgen.js/",
      copyright: "Copyright © 2024 Urban Trove. All rights reserved.",
      logo: "https://firebasestorage.googleapis.com/v0/b/newfoodapp-6f76d.appspot.com/o/logo.png?alt=media&token=91fc5015-ef7d-45a5-92cf-2950c3f61fdf",
      logoHeight: "30px",
    },
  });

  // Loop through each item in the order to send email to each vendor
  for (const item of order.items) {
    try {
      // Find vendor by ID
      const vendor = await User.findById(item.vendorid);
      if (!vendor) {
        console.error(`Vendor not found for ID: ${item.vendorid}`);
        continue; // Skip this item if vendor is not found
      }

      let response = {
        body: {
          name: vendor.name, // Use the vendor's name if available
          intro: [
            "You have a new order on Urban Trove!",
            `Order ${order.orderNo} has been placed and includes one of your products.`,
            "Please note: You have 3 days to send out this delivery, otherwise the order will be cancelled.",
            "Contact the customer as soon as possible for further details.",
          ],
          table: {
            title: `Order Details: ${order.orderNo}`,
            data: [
              {
                item: item.product.productName,
                price: `₦${Number(
                  item.product.prices.actualPrice
                ).toLocaleString()}`,
                quantity: item.quantity,
              },
            ],
            columns: {
              customWidth: {
                item: "60%",
                price: "40%",
              },
              customAlignment: {
                price: "right",
              },
            },
          },
          outro:
            "Need help or have questions? Just reply to this email, we'd love to assist.",
          signature: "Warm Regards",
        },
      };

      let mail = MailGenerator.generate(response);

      let message = {
        from: process.env.EMAIL,
        to: vendor.email, // Send email to the vendor
        subject: `New Order ${order.orderNo} for Your Product on Urban Trove`,
        html: mail,
      };

      const transporter = nodemailer.createTransport({
        host: "server2.lytehosting.com",
        port: 465,
        secure: true,
        auth: {
          user: process.env.EMAIL,
          pass: process.env.PASSWORD,
        },
        tls: {
          rejectUnauthorized: false,
        },
      });

      await transporter.sendMail(message);
      console.log(`Email sent to vendor: ${vendor.email}`);
    } catch (err) {
      console.error("Error sending email to vendor:", err);
    }
  }
};

exports.getPayment = tryCatch(async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({
      success: false,
      code: 422,
      status: "error",
      data: errors.array()[0],
    });
  }
  const response = await paymentInstance.paymentReceipt(req.query);
  res.status(200).json({
    success: true,
    status: "Payment Details",
    status: 200,
    data: response,
  });
});
exports.filterProducts = tryCatch(async (req, res, next) => {
  const features = new ApiFeatures(Product.find(), req.query)
    .filter()
    .sort()
    .limitFields();
  const data = await features.query;
  res.status(200).json({
    success: true,
    status: "Payment Details",
    status: 200,
    data: { product: data },
  });
});
exports.createPlan = async (req, res) => {
  try {
    const userId = req.user._id;
    const { billingPlan, amount } = req.body;

    const newPlan = new Plan({
      billingPlan,
      userId,
      amount,
      status: "pending",
    });

    await newPlan.save();

    return res.status(201).json({
      message: "Plan created successfully.",
      plan: newPlan,
    });
  } catch (error) {
    console.error("Error creating plan:", error);
    return res
      .status(500)
      .json({ message: "Server error. Please try again later." });
  }
};
exports.checkSubscription = async (req, res) => {
  try {
    const userId = req.user._id;

    // Find all plans associated with the user
    const subscriptions = await Plan.find({ userId });

    if (subscriptions.length === 0) {
      // No subscriptions found
      return res.status(404).json({
        success: false,
        message: "No subscriptions found for this user",
      });
    }

    // Check if any plan is active
    const activeSubscriptions = subscriptions.filter(
      (plan) => plan.status === "completed"
    );

    if (activeSubscriptions.length > 0) {
      return res.status(200).json({
        success: true,
        active: true,
        billingPlans: activeSubscriptions.map((plan) => ({
          billingPlan: plan.billingPlan,
          amount: plan.amount,
          expiresAt: plan.expiresAt,
        })),
      });
    } else {
      return res.status(200).json({
        success: true,
        active: false,
        billingPlans: [], // No active plans
      });
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "An error occurred while checking subscriptions",
    });
  }
};
