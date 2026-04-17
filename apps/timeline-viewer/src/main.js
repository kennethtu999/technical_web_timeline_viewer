import { createApp } from "vue";
import { createDiscreteApi } from "naive-ui";
import App from "./App.vue";
import "./styles/base.css";

const app = createApp(App);
const { message } = createDiscreteApi(["message"]);
app.config.globalProperties.$message = message;
app.mount("#app");
