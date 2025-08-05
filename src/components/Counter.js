import React from "react";

export class Counter extends React.Component {
  constructor(props) {
    super(props);
    this.state = { count : 0};
  }
  handleIncrement = () => {
    this.setState({ count: this.state.count + 1});
  }
  render() {
    const { count } = this.state;
    return(
      <div>
        <button onMouseEnter={this.handleIncrement}>increment to { count }</button>
      </div>
    );
  }
}