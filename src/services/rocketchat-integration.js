import axios from "axios";
import { humanizeAmount, zeroDecimalCurrencies } from "medusa-core-utils";
import { BaseService } from "medusa-interfaces";

class rocketChatService extends BaseService {
  /**
   * @param {Object} options - options defined in `medusa-config.js`
   *    {
   *      show_discount_code: If set to true the discount code used will be
   *        displayed in the order channel.
   *      rocketchat_url: "https://medusa-test.rocket.chat/hooks/",
   *      admin_orders_url: "https:..../orders"
   *    }
   */
  constructor({ orderService, totalsService, regionService }, options) {
    super();

    this.orderService_ = orderService;

    this.totalsService_ = totalsService;

    this.regionService_ = regionService;

    this.options_ = options;
  }

  async orderNotification(orderId) {
    const order = await this.orderService_.retrieve(orderId, {
      select: [
        "shipping_total",
        "discount_total",
        "tax_total",
        "refunded_total",
        "gift_card_total",
        "subtotal",
        "total",
      ],
      relations: [
        "customer",
        "billing_address",
        "shipping_address",
        "discounts",
        "discounts.rule",
        "shipping_methods",
        "payments",
        "fulfillments",
        "returns",
        "gift_cards",
        "gift_card_transactions",
        "swaps",
        "swaps.return_order",
        "swaps.payment",
        "swaps.shipping_methods",
        "swaps.shipping_address",
        "swaps.additional_items",
        "swaps.fulfillments",
      ],
    });

    const { subtotal, tax_total, discount_total, shipping_total, total } =
      order;

    const currencyCode = order.currency_code.toUpperCase();
    const getDisplayAmount = (amount) => {
      const humanAmount = humanizeAmount(amount, currencyCode);
      if (zeroDecimalCurrencies.includes(currencyCode.toLowerCase())) {
        return humanAmount;
      }
      return humanAmount.toFixed(2);
    };
    const payload ={
        body: [
        {
            "text": "Order Notification",
            "attachments": [
              {
                title: `Order *<${this.options_.admin_orders_url}/${order.id}|#${order.display_id}>* has been processed.`,
                title_link: `${this.options_.admin_orders_url}/${order.id}`,
                text: `${order.display_id}> has been processed`,
                color: "#764FA5"
              }
            ]
        }
    ]
    }

    if (order.gift_card_total) {
      payload.body[3].facts.push({
        title: "Gift Card Total",
        value: `${getDisplayAmount(order.gift_card_total)} ${currencyCode}`,
      });
    }

    if (this.options_.show_discount_code) {
      order.discounts.forEach((d) => {
        payload.body[3].facts.push({
          title: `Promo Code ${d.code}`,
          text: `${d.rule.value}${d.rule.type === "percentage" ? "%" : ` ${currencyCode}`
            }`,
        });
      });
    }
    for (const lineItem of order.items) {
      const totals = await this.totalsService_.getLineItemTotals(
        lineItem,
        order,
        {
          include_tax: true,
        }
      );
      const line = {
        type: "Container",
        spacing: "Small",
        padding: {
          top: "none",
          left: "default",
          bottom: "none",
          right: "default",
        },
        items: [
          {
            type: "ColumnSet",
            columns: [
              {
                type: "Column",
                width: "stretch",
                items: [
                  {
                    type: "Image",
                    size: "Medium",
                    width: "40px",
                    height: "30px",
                  },
                ],
              },
              {
                type: "Column",
                width: "stretch",
                items: [
                  {
                    type: "TextBlock",
                    text: `${lineItem.title}`,
                  },
                ],
              },
              {
                type: "Column",
                width: "stretch",
                items: [
                  {
                    type: "TextBlock",
                    text: `${lineItem.quantity}`,
                    color: "Attention",
                  },
                ],
              },
              {
                type: "Column",
                width: "stretch",
                items: [
                  {
                    type: "TextBlock",
                    text: `${getDisplayAmount(
                      totals.original_total
                    )} ${currencyCode}`,
                  },
                ],
              },
            ],
          },
        ],
      };

      if (lineItem.thumbnail) {
        let url = lineItem.thumbnail;
        if (lineItem.thumbnail.startsWith("//")) {
          url = `https:${lineItem.thumbnail}`;
        }

        line.items[0].columns[0].items[0].url = url;
      }

      payload.body.push(line);
    }
    return axios.post(this.options_.rocketchat_url, payload);
  }
}

export default rocketChatService;
