/**
 * Keyboards for the Bot menus
 */

const MainMenu = {
  reply_markup: {
    inline_keyboard: [
      [
        { text: "💰 My Balance", callback_data: "action_my_balance" },
        { text: "📜 Recent Transactions", callback_data: "action_recent_transactions" }
      ],
      [
        { text: "👤 My Profile", callback_data: "action_my_profile" },
        { text: "👥 View Users in Area", callback_data: "action_view_users" }
      ],
      [
        { text: "💳 Assign Package (Fund)", callback_data: "action_fund_user" }
      ]
    ]
  }
};

const CancelMenu = {
  reply_markup: {
    keyboard: [
      [{ text: "❌ Cancel" }]
    ],
    resize_keyboard: true,
    one_time_keyboard: true
  }
};

const BuildConfirmMenu = (actionData) => ({
  reply_markup: {
    inline_keyboard: [
      [
        { text: "✅ Confirm", callback_data: actionData },
        { text: "❌ Cancel", callback_data: "action_cancel" }
      ]
    ]
  }
});

module.exports = {
  MainMenu,
  CancelMenu,
  BuildConfirmMenu
};
