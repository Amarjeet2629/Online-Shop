const Product = require('../models/product');
const Order = require('../models/order');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const ITEMS_PER_PAGE = 1;
const stripe = require('stripe')('sk_test_51ISyKNDLJgnGctGq0tJY2tCnWxEIFlbOO4vBQJwnLZWoK17YqH6cexWcIVNt6GqYcfYtbhp3PGIqi5yY88WViQgU00rtjMPRlf');

exports.getProducts = (req, res, next) => {
  const page = +req.query.page || 1;
  let totalItems;
  Product.countDocuments()
  .then(numProducts => {
    totalItems = numProducts;
    return Product.find().skip((page-1) * ITEMS_PER_PAGE).limit(ITEMS_PER_PAGE);
  })
  .then(products => {
      res.render('shop/index', {
        prods: products,
        pageTitle: 'Products',
        path: '/products',
        currentPage: page,
        hasNextPage: page * ITEMS_PER_PAGE < totalItems,
        hasPrevPage: page > 1,
        nextPage: page + 1,
        prevPage: page - 1,
        lastPage: Math.ceil(totalItems / ITEMS_PER_PAGE)
      });
    })
    .catch(err => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.getProduct = (req, res, next) => {
  const prodId = req.params.productId;
  Product.findById(prodId)
    .then(product => {
      res.render('shop/product-detail', {
        product: product,
        pageTitle: product.title,
        path: '/products'
      });
    })
    .catch(err => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.getIndex = (req, res, next) => {
  const page = +req.query.page || 1;
  let totalItems;
  Product.countDocuments()
  .then(numProducts => {
    totalItems = numProducts;
    return Product.find().skip((page-1) * ITEMS_PER_PAGE).limit(ITEMS_PER_PAGE);
  })
  .then(products => {
      res.render('shop/index', {
        prods: products,
        pageTitle: 'Shop',
        path: '/',
        currentPage: page,
        hasNextPage: page * ITEMS_PER_PAGE < totalItems,
        hasPrevPage: page > 1,
        nextPage: page + 1,
        prevPage: page - 1,
        lastPage: Math.ceil(totalItems / ITEMS_PER_PAGE)
      });
    })
    .catch(err => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
      console.log(err);
    });
};

exports.getCart = (req, res, next) => {
  req.user
    .populate('cart.items.productId')
    .execPopulate()
    .then(user => {
      const products = user.cart.items;
      res.render('shop/cart', {
        path: '/cart',
        pageTitle: 'Your Cart',
        products: products
      });
    })
    .catch(err => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.postCart = (req, res, next) => {
  const prodId = req.body.productId;
  Product.findById(prodId)
    .then(product => {
      return req.user.addToCart(product);
    })
    .then(result => {
      console.log(result);
      res.redirect('/cart');
    })
    .catch(err => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.postCartDeleteProduct = (req, res, next) => {
  const prodId = req.body.productId;
  req.user
    .removeFromCart(prodId)
    .then(result => {
      res.redirect('/cart');
    })
    .catch(err => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.getCheckout = (req, res, next) => {
  let products;
  let total;
  req.user
    .populate('cart.items.productId')
    .execPopulate()
    .then(user => {
      products = user.cart.items;
      total = 0;
      products.forEach(p => {
        total += p.quantity * p.productId.price;
      });
      return stripe.checkout.sessions.create({
        mode:'payment',
        payment_method_types: ['card'],
        line_items: products.map(p => {
          return {
            name: p.productId.title,
            description: p.productId.description,
            amount: p.productId.price * 100,
            currency: 'inr',
            quantity: p.quantity,
          }
        }),
        success_url: req.protocol + '://' + req.get('host') + '/checkout/success',
        cancel_url: req.protocol + '://' + req.get('host') + '/checkout/cancel',
      });
    })
    .then(session => {
      res.render('shop/checkout', {
        path: '/checkout',
        pageTitle: 'Checkout',
        products: products,
        totalSum: total,
        sessionId: session.id
      });
    })
    .catch(err => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.postOrder = (req, res, next) => {
  req.user
    .populate('cart.items.productId')
    .execPopulate()
    .then(user => {
      const products = user.cart.items.map(i => {
        return { quantity: i.quantity, product: { ...i.productId._doc } };
      });
      const order = new Order({
        user: {
          email: req.user.email,
          userId: req.user
        },
        products: products
      });
      return order.save();
    })
    .then(result => {
      return req.user.clearCart();
    })
    .then(() => {
      res.redirect('/orders');
    })
    .catch(err => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.getOrders = (req, res, next) => {
  Order.find({ 'user.userId': req.user._id })
    .then(orders => {
      res.render('shop/orders', {
        path: '/orders',
        pageTitle: 'Your Orders',
        orders: orders
      });
    })
    .catch(err => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.getInvoice = (req, res, next) => {
  const orderId = req.params.orderId;
  Order.findById(orderId).then(order => {
    if(!order){
      return  next(new Error('No order with given Id exists !'));
    }
    if(order.user.userId.toString() !== req.user._id.toString()){
      return next(new Error('Unauthorized'));
    }
    else{
      const invoiceName = 'invoice-' + orderId + '.pdf';
      const invoicePath = path.join('data', 'invoices', invoiceName);
      const pdfDoc = new PDFDocument();

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
          'Content-Disposition',
          'inline; filename="' + invoiceName + '"'
      );
      
      pdfDoc.pipe(fs.createWriteStream(invoicePath));
      pdfDoc.pipe(res);

      pdfDoc.fontSize(26).text('Invoice', {
        underline: true,
        align: 'center',
      });
      pdfDoc.text('---------------------------------------------------');
      let totalPrice = 0;
      for(idx = 0; idx < order.products.length; idx++){
        pdfDoc.fontSize(15).text(order.products[idx].product.title + ' - ' + order.products[idx].quantity + ' x $ ' + order.products[idx].product.price);
        totalPrice += order.products[idx].product.price * order.products[idx].quantity;
      }
      pdfDoc.fontSize(26).text('---------------------------------------------------');
      pdfDoc.fontSize(10).text('Total Price - ' + totalPrice.toString());
      pdfDoc.end();
      // fs.readFile(invoicePath, (err, data)=>{
      //    if(err){
      //      return next(err);
      //    }
      //    res.setHeader('Content-Type', 'application/pdf');
      //    res.setHeader(
      //     'Content-Disposition',
      //     'inline; filename="' + invoiceName + '"'
      //   );
      //    res.send(data);
      // });
      // const file = fs.createReadStream(invoicePath);
      //    res.setHeader('Content-Type', 'application/pdf');
      //    res.setHeader(
      //     'Content-Disposition',
      //     'inline; filename="' + invoiceName + '"'
      //   );
      //    file.pipe(res);   
    }
  }).catch(err => {
    return next(err);
  });
};